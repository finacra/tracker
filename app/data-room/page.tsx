"use client";

import {
  useState,
  useEffect,
  Suspense,
  useMemo,
  useCallback,
  useRef,
  startTransition,
  lazy,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/react-query/query-keys";
import React from "react";

// Lazy load tracker tab for better performance
const TrackerTab = lazy(() => import("./components/tracker/TrackerTab"));
const DocumentsTab = lazy(() => import("./components/DocumentsTab"));
const ReportsTab = lazy(() => import("./components/ReportsTab"));
const OverviewTab = lazy(() => import("./components/OverviewTab"));
const NoticesTab = lazy(() => import("./components/NoticesTab"));
const GSTTab = lazy(() => import("./components/GSTTab"));
const DscDinTab = lazy(() => import("./components/DscDinTab"));
import Header from "@/components/layout/Header";
import CompanySelector from "@/components/features/CompanySelector";
import SubtleCircuitBackground from "@/components/ui/SubtleCircuitBackground";
import { OverviewStatsSkeleton } from "@/components/ui/skeletons/OverviewStatsSkeleton";
import { RequirementTableSkeleton } from "@/components/ui/skeletons/RequirementRowSkeleton";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  uploadDocument,
  getCompanyDocuments,
  getDocumentTemplates,
  getDownloadUrl,
  deleteDocument,
  uploadFileToStorage,
} from "@/app/data-room/document-actions";
import {
  getRegulatoryRequirements,
  updateRequirementStatus,
  createRequirement,
  deleteRequirement,
  updateRequirement,
  sendDocumentsEmail,
  getDirectors,
  hideDocumentTemplateForCompany,
  getHiddenDocumentTemplates,
  hideComplianceForCompany,
  showComplianceForCompany,
  getHiddenCompliances,
  getDataRoomInitState,
  getCompanyDetails,
  getCompanySwitchData,
  type RegulatoryRequirement,
} from "@/app/data-room/actions";
import {
  trackTrackerTabOpened,
  trackStatusChange,
  trackDocumentUpload,
  trackCalendarSync,
  trackVaultFileExport,
  trackReportDownload,
  trackVaultFileUpload,
} from "@/lib/tracking/kpi-tracker";
import { performanceLogger } from "@/lib/utils/performance-logger";
import jsPDF from "jspdf";
import { useUserRole } from "@/hooks/useUserRole";
import {
  useCompanyAccess,
  useAnyCompanyAccess,
  useUserSubscription,
} from "@/hooks/useCompanyAccess";
import { useRequirements } from "@/hooks/useRequirements";
import { TrackerContextProvider } from "@/contexts/TrackerContext";
import {
  enrichComplianceRequirements,
  type EnrichedComplianceData,
} from "@/app/data-room/actions-enrichment";
import { showToast } from "@/components/ui/Toast";
import ToastContainer from "@/components/ui/Toast";
import {
  getCurrentFinancialYear,
  parseFinancialYear,
  getFinancialYearMonths,
  isInFinancialYear as isInFinancialYearUtil,
} from "@/lib/utils/financial-year";
import { getCountryConfig } from "@/lib/config/countries";
import { formatCurrency } from "@/lib/utils/currency";
import { useCompanyCountry } from "@/hooks/useCompanyCountry";
import { useComplianceCategories } from "@/hooks/useComplianceCategories";
import { RegulatoryServiceImpl } from "./services/RegulatoryServiceImpl";
import { DataRoomProvider } from "@/contexts/DataRoomContext";
import { useAppStore } from "@/lib/store/appStore";

const isDataRoomDebugEnabled = process.env.NODE_ENV === "development";

interface Company {
  id: string;
  name: string;
  type: string;
  year: string;
  country_code?: string;
  region?: string;
  nic_code?: string | null;
  incorporation_date?: string | null;
}

interface Director {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string;
  din?: string;
  designation?: string;
  dob?: string;
  pan?: string;
  email?: string;
  mobile?: string;
  verified: boolean;
}

interface EntityDetails {
  companyName: string;
  type: string;
  regDate: string;
  taxId: string;
  registrationId: string;
  address: string;
  phoneNumber: string;
  industryCategory: string;
  directors: Director[];
  // CIN API fields
  authorisedCapital?: string | null;
  paidUpCapital?: string | null;
  companyCategory?: string | null;
  classOfCompany?: string | null;
  rocName?: string | null;
  companyStatus?: string | null;
  dateOfLastAgm?: string | null;
  balanceSheetDate?: string | null;
}

// Generate ICS calendar file from regulatory requirements
function generateICSFile(requirements: RegulatoryRequirement[]): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  let icsContent =
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Finacra//Compliance Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ].join("\r\n") + "\r\n";

  requirements.forEach((req, index) => {
    if (!req.due_date) return;

    const dueDate = new Date(req.due_date);
    const dateStr =
      dueDate.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const uid = `compliance-${req.id}-${index}@finacra.com`;

    // Escape text for ICS format
    const escapeText = (text: string | null | undefined) => {
      if (!text) return "";
      return text
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\n/g, "\\n");
    };

    const summary = escapeText(req.requirement || "");
    const description = escapeText(
      `${req.category || ""}${req.description ? ": " + req.description : ""}${req.penalty ? " | Penalty: " + req.penalty : ""}`,
    );

    icsContent +=
      [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${timestamp}`,
        `DTSTART:${dateStr}`,
        `DTEND:${dateStr}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        `STATUS:CONFIRMED`,
        `SEQUENCE:0`,
        "END:VEVENT",
      ].join("\r\n") + "\r\n";
  });

  icsContent += "END:VCALENDAR\r\n";

  return icsContent;
}

function DataRoomPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  // Memoize supabase client to prevent infinite re-renders
  const supabase = useMemo(() => createClient(), []);
  // Create service instance (DIP: Dependency injection)
  const regulatoryService = useMemo(() => new RegulatoryServiceImpl(), []);
  // Memoize initialCompanyId to prevent unnecessary re-renders
  const urlParamValue =
    searchParams.get("company_id") || searchParams.get("company") || null;
  const initialCompanyId = useMemo(() => urlParamValue, [urlParamValue]);

  // Sync company selection to Zustand so other components can read it
  const { setCurrentCompanyId } = useAppStore();

  const [currentCompany, setCurrentCompanyLocal] = useState<Company | null>(null);
  const setCurrentCompany = useCallback((company: Company | null) => {
    setCurrentCompanyLocal(company);
    setCurrentCompanyId(company?.id ?? null);
  }, [setCurrentCompanyId]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [isDataRoomInitLoading, setIsDataRoomInitLoading] = useState(true);
  const [isCompanySwitching, setIsCompanySwitching] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("Setting up your Data Room...");
  
  // Fallback: Rotate messages if initialization takes longer than expected
  // This prevents the loading screen from feeling stuck
  useEffect(() => {
    if (!isDataRoomInitLoading) {
      setLoadingMessage("Setting up your Data Room...");
      return;
    }
    
    const loadingMessages = [
      "🔐 Verifying access permissions...",
      "📊 Loading company information...",
      "📁 Organizing document structure...",
      "⚖️ Loading compliance requirements...",
      "📋 Preparing compliance tracker...",
      "✨ Finalizing your workspace...",
    ];
    
    // Only start rotating after 3 seconds (fallback if something is slow)
    const timeout = setTimeout(() => {
      let messageIndex = 0;
      const interval = setInterval(() => {
        if (!isDataRoomInitLoading) {
          clearInterval(interval);
          return;
        }
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        setLoadingMessage(loadingMessages[messageIndex]);
      }, 1200);
      
      return () => clearInterval(interval);
    }, 3000);
    
    return () => clearTimeout(timeout);
  }, [isDataRoomInitLoading]);
  
  const [entityDetails, setEntityDetails] = useState<EntityDetails | null>(
    null,
  );
  // Pre-fetched results from initialization to skip hook-driven loading flickers
  const [initDataResults, setInitDataResults] = useState<{
    companyId: string | null;
    hasAnyAccess: boolean;
    hasSubscription: boolean;
    accessibleCompanyIds: string[];
    userSubscription: any;
    companyAccess: any;
    userRole: any;
  } | null>(null);
  const [vaultDocuments, setVaultDocuments] = useState<any[]>([]);
  const [isLoadingVaultDocuments, setIsLoadingVaultDocuments] = useState(false);
  const [documentTemplates, setDocumentTemplates] = useState<any[]>([]);
  const [hiddenTemplates, setHiddenTemplates] = useState<Set<string>>(
    new Set(),
  ); // Track hidden templates as "folderName:documentName"
  const [hiddenCompliances, setHiddenCompliances] = useState<Set<string>>(
    new Set(),
  ); // Track hidden compliance IDs

  // Refs to track if data has been fetched to prevent re-fetching on tab switch
  const companiesFetchedRef = useRef(false);
  const companiesFetchingRef = useRef(false);
  const lastMessageUpdateRef = useRef(Date.now());
  const detailsFetchedRef = useRef<string | null>(null);
  const detailsFetchingRef = useRef<string | null>(null);
  const vaultDocumentsFetchedRef = useRef<string | null>(null);
  const [isGeneratingEnhancedPDF, setIsGeneratingEnhancedPDF] = useState(false);
  const [pdfGenerationProgress, setPdfGenerationProgress] = useState({
    current: 0,
    total: 0,
    step: "",
  });

  // Guard to prevent any automatic company changes during initial boot
  const didInitRef = useRef(false);
  const lockUntilRef = useRef(0);

  const {
    role,
    canEdit,
    canManage,
    loading: roleLoading,
    setRole,
  } = useUserRole(currentCompany?.id || null, { 
    enabled: !isDataRoomInitLoading,
    initialData: (initDataResults && currentCompany?.id === initDataResults.companyId) ? initDataResults.userRole : undefined
  });

  const {
    hasAccess,
    accessType,
    isLoading: accessLoading,
    trialDaysRemaining,
    isOwner,
    ownerSubscriptionExpired,
    error: accessError,
  } = useCompanyAccess(currentCompany?.id || null, { 
    enabled: !isDataRoomInitLoading,
    initialData: (initDataResults && currentCompany?.id === initDataResults.companyId) ? initDataResults.companyAccess : undefined
  });

  const {
    hasAnyAccess,
    accessibleCompanyIds,
    isLoading: anyAccessLoading,
  } = useAnyCompanyAccess({ 
    enabled: !isDataRoomInitLoading,
    initialData: initDataResults ? {
        hasAnyAccess: initDataResults.hasAnyAccess,
        accessibleCompanyIds: initDataResults.accessibleCompanyIds
    } : undefined
  });
  const {
    hasSubscription: userHasSubscription,
    isLoading: userSubscriptionLoading,
  } = useUserSubscription({
    enabled: !isDataRoomInitLoading,
    initialData: initDataResults?.userSubscription
  });

  const {
    requirements: regulatoryRequirements,
    setRequirements: setRegulatoryRequirements,
    isLoading: isLoadingRequirements,
    refresh: refreshRequirements,
    markFresh: markRequirementsFresh,
  } = useRequirements(currentCompany?.id, {
    enabled: !isDataRoomInitLoading,
    hasAccess: !!hasAccess,
  });

  // Main Data Room Initialization & URL Sync - Consolidated to prevent flickering/waterfalls
  // We wait for client auth to resolve first to prevent the reload redirect loop
  // (server-side session check can transiently fail, causing premature /login redirects).
  useEffect(() => {
    // Wait for client auth to resolve before calling server init
    if (authLoading) return;

    // Only skip if we're actively fetching (prevent duplicate concurrent calls)
    // On full reload, refs reset, so this check is fine
    if (companiesFetchingRef.current) {
      if (isDataRoomDebugEnabled) {
        console.log("[DataRoomInit] Already fetching, skipping duplicate call...");
      }
      return;
    }
    
    // If already fetched, we're done (this handles hot reloads where state persists)
    if (companiesFetchedRef.current) {
      if (isDataRoomDebugEnabled) {
        console.log("[DataRoomInit] Already fetched, skipping...");
      }
      // Ensure loading state is cleared if ref says we're done
      if (isDataRoomInitLoading) {
        setIsDataRoomInitLoading(false);
      }
      return;
    }
    
    async function initializeDataRoom() {
      companiesFetchingRef.current = true;
      setIsDataRoomInitLoading(true);
      
      if (isDataRoomDebugEnabled) {
        console.log("[DataRoomInit] Starting consolidated initialization...");
      }

      const startTime = performance.now();
      
      // Update loading messages as initialization progresses
      const updateLoadingMessage = (message: string) => {
        lastMessageUpdateRef.current = Date.now();
        setLoadingMessage(message);
      };
      
      try {
        updateLoadingMessage("🔐 Verifying access permissions...");
        const initStartTime = performance.now()
        const result = await getDataRoomInitState(initialCompanyId);
        const initDuration = performance.now() - initStartTime
        console.log(`[DataRoomInit] ⏱️ getDataRoomInitState took ${initDuration.toFixed(2)}ms (${(initDuration/1000).toFixed(1)}s)`)
        
        if (initDuration > 10000) {
          console.error(`[DataRoomInit] ❌ CRITICAL: Initialization took ${(initDuration/1000).toFixed(1)}s - check server logs for breakdown`)
        }
        
        if (!result.success || !result.data) {
          if (result.error?.includes('Not authenticated') || result.error?.includes('authenticated')) {
            // Client auth confirmed user is logged in, but server action disagrees.
            // This can happen after deployment (stale server functions). Reload once.
            console.warn('[DataRoomInit] Server auth mismatch, reloading...');
            window.location.reload();
            return;
          }
          throw new Error(result.error || "Failed to initialize Data Room");
        }

        const { data } = result;
        
        if (data._debug) {
            console.log("[DataRoomInit] 🔍 SERVER-SIDE BREAKDOWN:", data._debug);
        }
        
        // FAST-PATH: Immediate redirect if subscription expired (skip loading all data)
        if (data.redirectTo) {
          console.log("[DataRoomInit] Subscription expired, redirecting immediately to:", data.redirectTo);
          router.replace(data.redirectTo);
          return; // Exit early, don't load any data
        }
        
        updateLoadingMessage("📊 Loading company information...");
        
        // 1. Format and set companies
        // CRITICAL: Only show companies that are in accessibleCompanyIds
        // The SQL query now filters out expired companies, so this ensures consistency
        const formattedCompanies = (data.companies || [])
          .filter((c: any) => data.accessibleCompanyIds.includes(c.id))
          .map((c: any) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          year: c.incorporation_date ? new Date(c.incorporation_date).getFullYear().toString() : "N/A",
          country_code: c.country_code || "IN",
          region: c.region || "APAC",
          nic_code: c.nic_code || null,
          incorporation_date: c.incorporation_date || null,
        }));
        setCompanies(formattedCompanies);
        
        // 2. Determine Final Selected Company (Priority: URL > Preferred > First)
        // CRITICAL: NEVER auto-select companies with expired subscriptions
        const urlId = searchParams.get("company_id") || searchParams.get("company");
        
        let selected = null;
        
        // Only select if companyAccess shows subscription is NOT expired
        // If ownerSubscriptionExpired is true, skip this company entirely
        const isExpired = data.companyAccess?.ownerSubscriptionExpired === true;
        
        if (urlId && !isExpired) {
          // If URL has company_id, use it only if subscription is valid
          const urlCompany = formattedCompanies.find(c => c.id === urlId);
          if (urlCompany) {
            selected = urlCompany;
          }
        }
        
        // If no valid company from URL, try currentCompanyId (but ONLY if not expired)
        if (!selected && data.currentCompanyId && !isExpired) {
          const currentCompany = formattedCompanies.find(c => c.id === data.currentCompanyId);
          if (currentCompany) {
            selected = currentCompany;
          }
        }
        
        // If still no company, select first available from the list
        // The list should already be filtered to exclude expired companies
        if (!selected && formattedCompanies.length > 0) {
          selected = formattedCompanies[0];
        }
        
        // FINAL SAFETY CHECK: Don't set expired company
        if (selected && isExpired && selected.id === data.currentCompanyId) {
          console.warn('[DataRoomInit] Blocked auto-selection of expired company:', selected.id);
          selected = null;
        }
        
        setCurrentCompany(selected);

        updateLoadingMessage("📁 Organizing document structure...");

        // 3. Populate entity details and directors
        if (data.initialEntityDetails && selected?.id === data.currentCompanyId) {
            setEntityDetails(data.initialEntityDetails);
            detailsFetchedRef.current = selected.id;
        }

        // 4. Update hidden states and role
        if (data.hiddenTemplates) setHiddenTemplates(new Set(data.hiddenTemplates));
        if (data.hiddenCompliances) setHiddenCompliances(new Set(data.hiddenCompliances));
        // Note: setRole is no longer used - React Query manages role state
        
        updateLoadingMessage("⚖️ Loading compliance requirements...");

        // 5. Populate requirements + documents from init state (eliminates second fetch)
        console.log('[DataRoomInit] Requirements:', data.initialRequirements?.length || 0, 'selected:', selected?.id, 'currentCompanyId:', data.currentCompanyId)
        if (selected?.id === data.currentCompanyId) {
            if (data.initialRequirements && data.initialRequirements.length > 0) {
                setRegulatoryRequirements(data.initialRequirements);
                markRequirementsFresh(selected.id);
                console.log('[DataRoomInit] Pre-populated', data.initialRequirements.length, 'requirements')
            }
            if (data.initialVaultDocuments) {
                setVaultDocuments(data.initialVaultDocuments);
                vaultDocumentsFetchedRef.current = selected.id;
            }
        }

        updateLoadingMessage("✨ Finalizing your workspace...");

        // 6. Finalize Init State to trigger hooks
        setInitDataResults({
            companyId: selected?.id || null,
            hasAnyAccess: data.accessibleCompanyIds.length > 0,
            hasSubscription: data.userSubscription.hasSubscription,
            accessibleCompanyIds: data.accessibleCompanyIds,
            userSubscription: data.userSubscription,
            companyAccess: data.companyAccess,
            userRole: data.userRole
        });

        companiesFetchedRef.current = true;
        if (isDataRoomDebugEnabled) {
          console.log(`[DataRoomInit] Initialization took ${(performance.now() - startTime).toFixed(2)}ms`);
          console.log(`[DataRoomInit] Final selected company: ${selected?.name} (${selected?.id})`);
        }
      } catch (err: any) {
        console.error("[DataRoomInit] Initialization error:", err);
        setInitError(err.message || "Failed to initialize Data Room");
        setIsDataRoomInitLoading(false);
        setIsLoadingCompanies(false);
        setIsLoading(false);
      } finally {
        setIsDataRoomInitLoading(false);
        setIsLoadingCompanies(false);
        setIsLoading(false);
        companiesFetchingRef.current = false;
        didInitRef.current = true;
        lockUntilRef.current = Date.now() + 2000;
      }
    }

    initializeDataRoom();
  }, [initialCompanyId, router, authLoading]);

  // Check if user has access to ANY company - redirect if no access at all
  useEffect(() => {
    // If during initial boot, wait for it to finish
    if (isDataRoomInitLoading || authLoading) return;
    
    // Use init results if available, otherwise fallback to hooks
    const finalHasAnyAccess = initDataResults ? initDataResults.hasAnyAccess : hasAnyAccess;
    const finalHasSubscription = initDataResults ? initDataResults.hasSubscription : userHasSubscription;
    
    // If we have init results, we don't need to wait for the hooks
    const isWaitingForHooks = !initDataResults && (anyAccessLoading || userSubscriptionLoading);
    
    // Wait for all loading states to complete before making redirect decisions
    // If we have initDataResults, we ignore accessLoading from the hook
    const isActuallyLoading = isWaitingForHooks || isLoading || (!initDataResults && accessLoading);

    if (isActuallyLoading)
      return;

    // If no user, redirect to login with return URL for deep linking
    if (!user) {
      const returnPath = window.location.pathname + window.location.search;
      router.push(`/login?returnTo=${encodeURIComponent(returnPath)}`);
      return;
    }

    // If user has no companies at all, check if they're a team member
    // Team members should go to /owner-subscription-expired, not /subscribe
    if (companies.length === 0 && !isLoading) {
      // Check if user is a team member (has roles but subscription expired)
      const isTeamMember = initDataResults?.companyAccess 
        ? !initDataResults.companyAccess.isOwner && initDataResults.companyAccess.ownerSubscriptionExpired
        : false;
      
      if (isTeamMember) {
        console.log('[DataRoom] Team member has no accessible companies, redirecting to owner-subscription-expired');
        router.push("/owner-subscription-expired");
        return;
      }
      
      // Owner with no companies - redirect to onboarding or subscribe
      if (finalHasSubscription) {
        router.push("/onboarding");
      } else {
        router.push("/subscribe");
      }
      return;
    }

    // Only redirect to subscribe if we're CERTAIN the user has no access
    // This prevents premature redirects during loading states
    // Check: user has companies, all loading is done, and we're sure there's no access
    if (companies.length > 0 && !isLoading && !isWaitingForHooks && !accessLoading) {
      // Double-check: if initDataResults exists, use it; otherwise trust the hook
      const definitelyNoAccess = initDataResults 
        ? !initDataResults.hasAnyAccess && initDataResults.accessibleCompanyIds.length === 0
        : !hasAnyAccess && !anyAccessLoading;
      
      if (definitelyNoAccess) {
        // Check if user is a team member (not owner) with expired subscription
        // Team members should go to /owner-subscription-expired, not /subscribe
        const isTeamMember = initDataResults?.companyAccess 
          ? !initDataResults.companyAccess.isOwner && initDataResults.companyAccess.ownerSubscriptionExpired
          : false;
        
        if (isTeamMember) {
          console.log('[DataRoom] Team member has no access due to expired owner subscription, redirecting to owner-subscription-expired');
          router.push("/owner-subscription-expired");
        } else {
        console.log('[DataRoom] User has companies but no access, redirecting to subscribe');
        router.push("/subscribe");
        }
        return;
      }
    }
  }, [
    companies.length,
    hasAnyAccess,
    anyAccessLoading,
    authLoading,
    isLoading,
    isDataRoomInitLoading,
    initDataResults,
    userSubscriptionLoading,
    userHasSubscription,
    accessLoading,
    user,
    router,
  ]);

  // Check access when company is selected - redirect if no access
  // CRITICAL: If subscription/trial expired, NO ONE (not even team members) should access data-room
  useEffect(() => {
    // Determine if we are still loading access. 
    // If we have matching initDataResults, we trust it and don't care if the hooks are still "loading" their own check.
    const isMatchingInit = initDataResults && currentCompany?.id === initDataResults.companyId;
    const isActuallyLoadingAccess = isMatchingInit ? false : accessLoading;
    
    // Wait for all loading states to complete
    if (isActuallyLoadingAccess || authLoading || accessError) return;

    // If no company selected, don't check access yet
    if (!currentCompany) return;

    const finalOwnerSubscriptionExpired = isMatchingInit 
      ? initDataResults.companyAccess.ownerSubscriptionExpired 
      : ownerSubscriptionExpired;
      
    const finalIsOwner = isMatchingInit 
      ? initDataResults.companyAccess.isOwner 
      : isOwner;
      
    const finalHasAccess = isMatchingInit 
      ? initDataResults.companyAccess.hasAccess 
      : hasAccess;

    // CRITICAL: If subscription expired, redirect EVERYONE (owners and team members)
    if (finalOwnerSubscriptionExpired) {
      if (finalIsOwner) {
        console.log(
          "[Access Check] Owner subscription/trial expired, redirecting to subscription-required page",
        );
        router.replace(`/subscription-required?company_id=${currentCompany.id}`);
        return;
      } else {
        console.log(
          "[Access Check] Owner subscription/trial expired - team member cannot access, redirecting to owner-subscription-expired page",
        );
        router.replace(
          `/owner-subscription-expired?company_id=${currentCompany.id}`,
        );
        return;
      }
    }

    // If user is owner but no subscription/trial (or company subscription revoked/expired)
    if (finalIsOwner && !finalHasAccess) {
      console.log(
        "[Access Check] Owner has no subscription or company subscription expired, redirecting to subscription-required page",
      );
      router.replace(`/subscription-required?company_id=${currentCompany.id}`);
      return;
    }

    // If user is not owner and doesn't have access for other reasons
    if (!finalHasAccess && !finalIsOwner) {
      console.log("[Access Check] No access to this company");
      router.replace(`/subscription-required?company_id=${currentCompany.id}`);
    }
  }, [
    currentCompany,
    hasAccess,
    isOwner,
    ownerSubscriptionExpired,
    accessLoading,
    authLoading,
    accessError,
    router,
  ]);

  const fetchVaultDocuments = async () => {
    if (!currentCompany) return;
    setIsLoadingVaultDocuments(true);
    try {
      console.log('[fetchVaultDocuments] Fetching documents for company:', currentCompany.id);
      const result = await getCompanyDocuments(currentCompany.id);
      
      if (result.success) {
        setVaultDocuments(result.documents || []);
        vaultDocumentsFetchedRef.current = currentCompany.id;
        console.log('[fetchVaultDocuments] Set vault documents:', result.documents?.length || 0);
      } else {
        // Handle UnrecognizedActionError (stale build)
        if (result.error?.includes('UnrecognizedActionError')) {
          console.warn('[fetchVaultDocuments] Stale build detected, reloading...');
          window.location.reload();
          return;
        }
        console.error("[fetchVaultDocuments] Failed to load vault documents:", result.error);
        setVaultDocuments([]);
      }
    } catch (err: any) {
      console.error("[fetchVaultDocuments] Error fetching vault documents:", err);
      if (err.message?.includes('UnrecognizedActionError')) {
        window.location.reload();
      }
      setVaultDocuments([]);
    } finally {
      setIsLoadingVaultDocuments(false);
    }
  };

  // Fetch requirements and documents whenever company ID changes (consolidated trigger)
  useEffect(() => {
    if (!currentCompany || isDataRoomInitLoading || companySwitchInProgressRef.current) return;

    const companyId = currentCompany.id;

    // Fetch vault documents if not already fetched for this company
    if (vaultDocumentsFetchedRef.current !== companyId) {
        fetchVaultDocuments();
    }
  }, [currentCompany?.id, isDataRoomInitLoading]);

  // Fetch specific company details and directors when currentCompany changes
  useEffect(() => {
    async function fetchDetails() {
      // Skip if during initial boot or batched company switch is in progress
      if (isDataRoomInitLoading || !currentCompany || companySwitchInProgressRef.current) return;

      // Skip if already fetched for this company (prevents re-fetch on tab switch or remount)
      // Check both ref and state to handle remounts where refs reset but state persists
      const hasCorrectData =
        entityDetails && entityDetails.companyName === currentCompany.name;

      if (detailsFetchedRef.current === currentCompany.id || hasCorrectData) {
        if (detailsFetchedRef.current !== currentCompany.id) {
          console.log(
            "[fetchDetails] Correct data found in state, updating ref",
          );
          detailsFetchedRef.current = currentCompany.id;
        } else {
          console.log(
            "[fetchDetails] Already fetched and ref matches, skipping...",
          );
        }

        if (isLoading) {
          setIsLoading(false);
        }
        return;
      }

      if (detailsFetchingRef.current === currentCompany.id) {
        return;
      }

      // ONLY set isLoading(true) if we actually need to fetch (prevents boot flicker)
      if (!hasCorrectData) {
          setIsLoading(true);
      }
      const startTime = performance.now();
      console.log(
        "[fetchDetails] Starting fetch for company:",
        currentCompany.id,
      );
      detailsFetchingRef.current = currentCompany.id;

      try {
        // Fetch company details and directors IN PARALLEL
        // Use server actions to bypass RLS and support both Supabase and Passport users
        const [companyResult, directorsResult] = await Promise.all([
          getCompanyDetails(currentCompany.id),
          getDirectors(currentCompany.id),
        ]);

        console.log(
          "[fetchDetails] Parallel fetch completed in",
          Math.round(performance.now() - startTime),
          "ms",
        );

        if (!companyResult.success) {
          console.error(
            "[fetchDetails] Company fetch error:",
            companyResult.error,
          );
          throw new Error(companyResult.error || 'Failed to fetch company details');
        }
        if (!directorsResult.success) {
          console.error(
            "[fetchDetails] Directors fetch error:",
            directorsResult.error,
          );
          // Don't throw - continue with empty directors array
        }

        const company = companyResult.company;
        const directors = directorsResult.directors || [];

        console.log(
          "[fetchDetails] Directors fetched:",
          directors.length,
          "directors",
        );
        console.log("[fetchDetails] Directors data:", directors);

        // Map to EntityDetails structure
        if (company) {
          // Get country config for date formatting (use current company's country)
          const companyCountryCode = company.country_code || "IN";
          const countryConfig = getCountryConfig(companyCountryCode);

          // Format date based on country config
          const incorporationDate = new Date(company.incorporation_date);
          let formattedDate = "";
          if (countryConfig?.dateFormat === "DD/MM/YYYY") {
            formattedDate = incorporationDate.toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            });
          } else {
            formattedDate = incorporationDate.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            });
          }

          const mappedDetails: EntityDetails = {
            companyName: company.name,
            type: company.type ? company.type.toUpperCase() : '',
            regDate: formattedDate,
            taxId: company.tax_id || "Not Provided", // Generic tax identifier
            registrationId: company.registration_id || "Not Provided", // Generic registration identifier
            address: company.address || '',
            phoneNumber: company.phone_number || "Not Provided",
            industryCategory: Array.isArray(company.industry_categories)
              ? company.industry_categories.join(", ")
              : company.industry || '',
            directors: directors.map((d) => ({
              id: d.id,
              firstName: d.firstName,
              lastName: d.lastName,
              middleName: d.middleName,
              din: d.din,
              designation: d.designation,
              dob: d.dob,
              pan: d.pan,
              email: d.email,
              mobile: d.mobile,
              verified: d.verified,
            })),
          };
          setEntityDetails(mappedDetails);
        }

        // Mark as fetched for this company
        detailsFetchedRef.current = currentCompany.id;

        // Fetch vault documents in background (don't block UI)
        fetchVaultDocuments();

        console.log(
          "[fetchDetails] Total time:",
          Math.round(performance.now() - startTime),
          "ms",
        );
      } catch (err) {
        console.error("Error fetching entity details:", err);
      } finally {
        if (detailsFetchingRef.current === currentCompany.id) {
          detailsFetchingRef.current = null;
        }
        setIsLoading(false);
      }
    }

    fetchDetails();
  }, [currentCompany?.id]); // Remove supabase from dependencies - it's stable and doesn't need to trigger re-fetches


  // Guard: prevents individual useEffects from racing with the batched company switch
  const companySwitchInProgressRef = useRef(false);

  // Handle company change - batched fetch for all company-specific data
  const handleCompanyChange = useCallback(
    async (company: Company) => {
      // Pre-set refs IMMEDIATELY to prevent individual useEffects from firing
      // (they check these refs and skip if data is already "fetched" for this company)
      companySwitchInProgressRef.current = true;
      setIsCompanySwitching(true);
      detailsFetchedRef.current = company.id;
      vaultDocumentsFetchedRef.current = company.id;

      setCurrentCompany(company);
      // Update URL params without causing navigation
      const params = new URLSearchParams(searchParams.toString());
      params.set("company_id", company.id);
      router.replace(`/data-room?${params.toString()}`, { scroll: false });
      // Reset director selection when company changes
      setSelectedDirectorId(null);

      // Fetch ALL company-specific data in a single server action
      // This replaces 5 separate useEffect-driven fetches that each did their own auth+access check
      try {
        const result = await getCompanySwitchData(company.id);
        if (result.success && result.data) {
          const { data } = result;
          const companyCountryCode = data.company.country_code || "IN";
          const cc = getCountryConfig(companyCountryCode);
          const incorporationDate = new Date(data.company.incorporation_date);
          let formattedDate = "";
          if (cc?.dateFormat === "DD/MM/YYYY") {
            formattedDate = incorporationDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
          } else {
            formattedDate = incorporationDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
          }

          setEntityDetails({
            companyName: data.company.name,
            type: data.company.type ? data.company.type.toUpperCase() : '',
            regDate: formattedDate,
            taxId: data.company.tax_id || "Not Provided",
            registrationId: data.company.registration_id || "Not Provided",
            address: data.company.address || '',
            phoneNumber: data.company.phone_number || "Not Provided",
            industryCategory: Array.isArray(data.company.industry_categories)
              ? data.company.industry_categories.join(", ")
              : data.company.industry || '',
            directors: data.directors.map((d) => ({
              id: d.id,
              firstName: d.firstName,
              lastName: d.lastName,
              middleName: d.middleName,
              din: d.din,
              designation: d.designation,
              dob: d.dob,
              pan: d.pan,
              email: d.email,
              mobile: d.mobile,
              verified: d.verified,
            })),
          });

          setVaultDocuments(data.documents);

          setHiddenTemplates(new Set(data.hiddenTemplates));
          setHiddenCompliances(new Set(data.hiddenComplianceIds));

          // Set requirements directly from batched response (avoids separate useRequirements fetch)
          setRegulatoryRequirements(data.requirements);
          markRequirementsFresh(company.id);

          // Pre-populate React Query cache so hooks don't trigger redundant server calls
          queryClient.setQueryData(queryKeys.companyAccess(company.id), data.companyAccess);
          queryClient.setQueryData(queryKeys.userRole(company.id), data.userRole);
        } else {
          // Batched call failed — clear refs so individual useEffects can retry
          detailsFetchedRef.current = null;
          vaultDocumentsFetchedRef.current = null;
        }
      } catch (err) {
        console.error("[handleCompanyChange] Batched fetch error:", err);
        detailsFetchedRef.current = null;
        vaultDocumentsFetchedRef.current = null;
      } finally {
        companySwitchInProgressRef.current = false;
        setIsCompanySwitching(false);
      }
      templatesFetchedRef.current.clear();
    },
    [router, searchParams, queryClient, markRequirementsFresh],
  );

  // Sync URL params to state when they change manually (from outside the init flow)
  useEffect(() => {
    if (!companiesFetchedRef.current || companies.length === 0) return;

    const urlCompanyId = searchParams.get("company_id") || searchParams.get("company");
    if (!urlCompanyId) return;

    // Prevent SYNC from fighting INIT flow: If we just finished init, don't allow sync to change it for 2s
    if (Date.now() < lockUntilRef.current) {
        if (isDataRoomDebugEnabled) {
            console.log("[Sync] Guarded by lockUntil, skipping sync for ID:", urlCompanyId);
        }
        return;
    }

    const companyFromUrl = companies.find((c) => c.id === urlCompanyId);
    if (companyFromUrl && currentCompany?.id !== urlCompanyId) {
        if (isDataRoomDebugEnabled) {
            console.log(`[Sync] Legitimate URL change detected: ${currentCompany?.id} -> ${urlCompanyId}`);
        }
        // Use the same batched fetch as handleCompanyChange
        handleCompanyChange(companyFromUrl);
    }
  }, [searchParams, companies]);

  const [selectedDirectorId, setSelectedDirectorId] = useState<string | null>(
    null,
  );

  // Reset director selection when company changes
  useEffect(() => {
    setSelectedDirectorId(null);
  }, [currentCompany?.id]);

  // Fetch hidden templates when company changes
  useEffect(() => {
    const fetchTemplates = async () => {
      // Skip if during initial boot or batched switch
      if (isDataRoomInitLoading || !currentCompany || companySwitchInProgressRef.current) {
        if (!currentCompany) setHiddenTemplates(new Set());
        return;
      }

      try {
        const result = await getHiddenDocumentTemplates(currentCompany.id);
        if (result.success && result.hiddenTemplates) {
          const hiddenSet = new Set(
            result.hiddenTemplates.map(
              (t: any) => `${t.folder_name}:${t.document_name}`,
            ),
          );
          setHiddenTemplates(hiddenSet);
        }
      } catch (error) {
        console.error("Error fetching hidden templates:", error);
        setHiddenTemplates(new Set());
      }
    };

    fetchTemplates();
  }, [currentCompany?.id, isDataRoomInitLoading]);

  // Fetch hidden compliances when company changes
  useEffect(() => {
    const fetchCompliances = async () => {
      // Skip if during initial boot or batched switch
      if (isDataRoomInitLoading || !currentCompany || companySwitchInProgressRef.current) {
        if (!currentCompany) setHiddenCompliances(new Set());
        return;
      }

      try {
        const result = await getHiddenCompliances(currentCompany.id);
        if (result.success && result.hiddenComplianceIds) {
          setHiddenCompliances(new Set(result.hiddenComplianceIds));
        } else {
          setHiddenCompliances(new Set());
        }
      } catch (error) {
        console.error("Error fetching hidden compliances:", error);
        setHiddenCompliances(new Set());
      }
    };

    fetchCompliances();
  }, [currentCompany?.id, isDataRoomInitLoading]);

  // Active tab — URL is source of truth on load; Zustand persists within-session
  const { activeTab: storedTab, setActiveTab: setStoredTab } = useAppStore();
  const urlTab = searchParams.get("tab");
  const [activeTab, setActiveTabLocal] = useState(urlTab ?? storedTab ?? "overview");
  const setActiveTab = useCallback((tab: string) => {
    setActiveTabLocal(tab);
    setStoredTab(tab as import("@/lib/store/appStore").DataRoomTab);
    // Reflect in URL without adding to browser history
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [setStoredTab, router]);

  // GST Integration States
  // GST tab state moved to GSTTab component

  // Notices States
  // Notices tab state moved to NoticesTab component
  const [complianceDetailsModal, setComplianceDetailsModal] =
    useState<any>(null);
  // Notices form state moved to NoticesTab component

  // Document upload from tracker
  const [documentUploadModal, setDocumentUploadModal] = useState<{
    isOpen: boolean;
    requirementId: string;
    requirement: string;
    category: string;
    documentName: string;
    complianceType: string;
    dueDate: string;
    financialYear: string | null;
    allRequiredDocs: string[];
  } | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStage, setUploadStage] = useState<string>("");
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);
  const [requirementUploadHistory, setRequirementUploadHistory] = useState<
    any[]
  >([]);

  // Demo Notices Data moved to NoticesTab component

  // Get country configuration for current company (must be before useEffect that uses it)
  const { countryCode, countryConfig } = useCompanyCountry(currentCompany);

  // Fetch compliance categories from database
  const { categories: complianceCategories } = useComplianceCategories(
    countryCode || "IN",
  );

  // Track if templates have been fetched to prevent re-fetching on tab switch
  const templatesFetchedRef = useRef<Set<string>>(new Set());

  // Fetch document templates when country code changes (must be after countryCode is defined)
  useEffect(() => {
    if (!countryCode) return;
    // Skip if already fetched for this country
    if (templatesFetchedRef.current.has(countryCode)) return;

    async function fetchTemplates() {
      try {
        // Use server action which bypasses RLS
        const result = await getDocumentTemplates();
        if (result.success && result.templates) {
          // Filter by country code on client side if templates have country_code
          const filtered = result.templates.filter(
            (t: any) => !t.country_code || t.country_code === countryCode,
          );
          setDocumentTemplates(filtered);
          templatesFetchedRef.current.add(countryCode);
        }
      } catch (error) {
        console.error("Error fetching templates:", error);
        setDocumentTemplates([]);
      }
    }

    fetchTemplates();
  }, [countryCode]);

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
  const [isAdvancedOptionsOpen, setIsAdvancedOptionsOpen] = useState(false);
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const [showComplianceContext, setShowComplianceContext] = useState(true);
  const [bulkUploadFiles, setBulkUploadFiles] = useState<File[]>([]);
  const [bulkUploadProgress, setBulkUploadProgress] = useState<{
    current: number;
    total: number;
  }>({ current: 0, total: 0 });
  // Track advanced options for each file in bulk upload (indexed by file name)
  const [bulkUploadFileOptions, setBulkUploadFileOptions] = useState<
    Record<
      string,
      {
        documentName: string;
        registrationDate: string;
        expiryDate: string;
        frequency: string;
        hasNote: boolean;
        externalEmail: string;
        externalPassword: string;
      }
    >
  >({});
  // Track which file's advanced options are expanded
  const [expandedBulkFileOptions, setExpandedBulkFileOptions] = useState<
    Set<string>
  >(new Set());
  // Track which file's document name dropdown is open
  const [openDocumentNameDropdown, setOpenDocumentNameDropdown] = useState<
    string | null
  >(null);
  const [previewDocument, setPreviewDocument] = useState<any | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewModalTab, setPreviewModalTab] = useState<
    "preview" | "compliance"
  >("preview");
  const [isStorageBreakdownOpen, setIsStorageBreakdownOpen] = useState(false);
  const [expiringSoonFilter, setExpiringSoonFilter] = useState<
    "all" | "expiring" | "expired"
  >("all");
  const [selectedVersions, setSelectedVersions] = useState<
    Record<string, number>
  >({});
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [expandedDocumentVersions, setExpandedDocumentVersions] = useState<
    Set<string>
  >(new Set());
  const [expandedYearGroups, setExpandedYearGroups] = useState<
    Record<string, Set<string>>
  >({});
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isEmailTemplateOpen, setIsEmailTemplateOpen] = useState(false);
  const [selectedFY, setSelectedFY] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortOption, setSortOption] = useState<
    | "name-asc"
    | "name-desc"
    | "date-newest"
    | "date-oldest"
    | "expiry"
    | "folder"
  >("date-newest");
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(
    new Set(),
  );
  const [selectedDocumentsToSend, setSelectedDocumentsToSend] = useState<
    Set<string>
  >(new Set());
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailData, setEmailData] = useState({
    recipients: "",
    subject: "Document Sharing - Compliance Vault",
    content: "Please find the attached documents from our Compliance Vault.",
  });

  // Generate financial years from 2019 to current year (country-aware)
  const currentYear = new Date().getFullYear();
  const financialYears = useMemo(() => {
    const years: string[] = [];
    for (let year = 2019; year <= currentYear; year++) {
      // Generate FY based on country's FY start month
      const config = countryConfig;
      if (config.financialYear.type === "CY") {
        years.push(`CY ${year}`);
      } else {
        // FY format: FY 2024-25
        years.push(`FY ${year}-${(year + 1).toString().slice(-2)}`);
      }
    }
    return years.reverse();
  }, [currentYear, countryConfig]);
  const [uploadFormData, setUploadFormData] = useState({
    folder: "",
    documentName: "",
    registrationDate: "",
    expiryDate: "",
    hasNote: false,
    externalEmail: "",
    externalPassword: "",
    frequency: "annually", // Default frequency
    file: null as File | null,
    // Period metadata for tracker integration
    periodType: "" as "" | "one-time" | "monthly" | "quarterly" | "annual",
    periodFinancialYear: "",
    periodKey: "",
    requirementId: "", // If uploading from tracker context
  });

  const [isUploading, setIsUploading] = useState(false);

  // Country-aware default folders and documents
  const getCountryDefaultFolders = (countryCode: string): string[] => {
    const config = countryConfig;
    if (!config)
      return [
        "Constitutional Documents",
        "Financials and licenses",
        "Taxation & GST Compliance",
        "Regulatory & MCA Filings",
      ];

    // Base folders that apply to all countries
    const baseFolders = ["Constitutional Documents", "Financials and licenses"];

    // Country-specific compliance folders based on compliance categories
    const complianceFolders: string[] = [];

    if (countryCode === "IN") {
      // India-specific folders
      complianceFolders.push(
        "Taxation & GST Compliance",
        "Regulatory & MCA Filings",
      );
    } else if (["AE", "SA", "OM", "QA", "BH"].includes(countryCode)) {
      // GCC countries
      complianceFolders.push(
        "VAT & Tax Compliance",
        "Corporate & Regulatory Filings",
      );
    } else if (countryCode === "US") {
      // USA
      complianceFolders.push(
        "Federal Tax Returns",
        "State Tax Returns",
        "Business License & Registration",
      );
    } else {
      // Fallback
      complianceFolders.push("Tax Compliance", "Regulatory Filings");
    }

    return [...baseFolders, ...complianceFolders];
  };

  const getCountryDefaultDocuments = (
    countryCode: string,
  ): Record<string, string[]> => {
    const config = countryConfig;
    if (!config) {
      return {
        "Constitutional Documents": [
          "Certificate of Incorporation",
          "MOA (Memorandum of Association)",
          "AOA (Articles of Association)",
          "Rental Deed",
          "DIN Certificate",
        ],
        "Financials and licenses": ["PAN", "TAN"],
        "Taxation & GST Compliance": ["GST Returns", "Income Tax Returns"],
        "Regulatory & MCA Filings": ["Annual Returns", "Board Minutes"],
      };
    }

    // Use country config's document types and compliance categories
    const constitutionalDocs = config.onboarding.documentTypes.filter(
      (doc) =>
        doc.includes("Certificate") ||
        doc.includes("Memorandum") ||
        doc.includes("Articles") ||
        doc.includes("Association"),
    );

    const financialDocs = config.onboarding.documentTypes.filter(
      (doc) =>
        doc === config.labels.taxId ||
        doc.includes("TAN") ||
        doc.includes("Tax") ||
        doc.includes("License"),
    );

    const complianceDocs: Record<string, string[]> = {};

    if (countryCode === "IN") {
      // India-specific documents
      complianceDocs["Taxation & GST Compliance"] = [
        "GST Returns",
        "Income Tax Returns",
      ];
      complianceDocs["Regulatory & MCA Filings"] = [
        "Annual Returns",
        "Board Minutes",
        "ROC Filings",
      ];
    } else if (["AE", "SA", "OM", "QA", "BH"].includes(countryCode)) {
      // GCC countries
      complianceDocs["VAT & Tax Compliance"] = [
        "VAT Returns",
        "Corporate Tax Returns",
      ];
      complianceDocs["Corporate & Regulatory Filings"] = [
        "Commercial Registration",
        "Trade License Renewal",
        "Annual Returns",
      ];
    } else if (countryCode === "US") {
      // USA
      complianceDocs["Federal Tax Returns"] = [
        "Federal Income Tax Return",
        "EIN Certificate",
      ];
      complianceDocs["State Tax Returns"] = [
        "State Income Tax Return",
        "Sales Tax Return",
      ];
      complianceDocs["Business License & Registration"] = [
        "Business License",
        "State Registration",
        "Annual Report",
      ];
    } else {
      // Fallback
      complianceDocs["Tax Compliance"] = ["Tax Returns"];
      complianceDocs["Regulatory Filings"] = ["Annual Returns"];
    }

    return {
      "Constitutional Documents":
        constitutionalDocs.length > 0
          ? constitutionalDocs
          : ["Certificate of Incorporation", "Memorandum of Association"],
      "Financials and licenses":
        financialDocs.length > 0 ? financialDocs : [config.labels.taxId],
      ...complianceDocs,
    };
  };

  // Get country-specific defaults
  const DEFAULT_FOLDERS = useMemo(() => {
    return getCountryDefaultFolders(countryCode || "IN");
  }, [countryCode, countryConfig]);

  const DEFAULT_DOCUMENTS = useMemo(() => {
    return getCountryDefaultDocuments(countryCode || "IN");
  }, [countryCode, countryConfig]);

  // Merge database templates with defaults to ensure all folders are present
  // Prioritize country-aware DEFAULT_FOLDERS, filter out country-inappropriate folders
  const documentFolders = useMemo(() => {
    const countryFolders = new Set(DEFAULT_FOLDERS);

    // Only add database template folders if they're appropriate for the country
    if (documentTemplates.length > 0) {
      documentTemplates.forEach((t) => {
        const folderName = t.folder_name;
        const folderLower = folderName.toLowerCase();

        // Skip if already in country-specific folders
        if (countryFolders.has(folderName)) {
          return;
        }

        // Filter out India-specific folders for non-India countries
        if (countryCode !== "IN") {
          // Don't add India-specific folder names
          if (
            folderLower.includes("gst") ||
            folderLower.includes("mca") ||
            folderLower.includes("roc") ||
            folderLower.includes("income tax") ||
            folderLower.includes("taxation & gst") ||
            folderLower.includes("regulatory & mca")
          ) {
            return; // Skip India-specific folders
          }
        }

        // Add the folder if it passed the filter
        countryFolders.add(folderName);
      });
    }

    return Array.from(countryFolders);
  }, [DEFAULT_FOLDERS, documentTemplates, countryCode]);

  // Merge database templates with defaults, filtering out hidden templates
  const predefinedDocuments = useMemo(() => {
    if (documentTemplates.length > 0) {
      // Start with defaults (ensures PAN and TAN are in Financials and licenses)
      const merged = { ...DEFAULT_DOCUMENTS };

      // Add/override with database templates, but move PAN and TAN to correct folder
      documentTemplates.forEach((template) => {
        const docName = template.document_name;
        const folderName = template.folder_name;

        // Skip if this template is hidden for this company
        const templateKey = `${folderName}:${docName}`;
        if (hiddenTemplates.has(templateKey)) {
          return;
        }

        // Country-specific tax ID documents should be in "Financials and licenses"
        const taxIdLabel = countryConfig?.labels.taxId || "PAN";
        if (
          docName === taxIdLabel ||
          docName === "PAN" ||
          docName === "TAN" ||
          (countryCode !== "IN" &&
            (docName.includes("Tax") ||
              docName.includes("VAT") ||
              docName.includes("Registration")))
        ) {
          // Remove from any other folder
          Object.keys(merged).forEach((folder) => {
            if (folder !== "Financials and licenses") {
              merged[folder] = merged[folder].filter(
                (d: string) => d !== docName,
              );
            }
          });
          // Add to Financials and licenses
          if (!merged["Financials and licenses"]) {
            merged["Financials and licenses"] = [];
          }
          if (!merged["Financials and licenses"].includes(docName)) {
            merged["Financials and licenses"].push(docName);
          }
        } else {
          // For other documents, add to their specified folder
          if (!merged[folderName]) {
            merged[folderName] = [];
          }
          if (!merged[folderName].includes(docName)) {
            merged[folderName].push(docName);
          }
        }
      });

      // Ensure tax ID documents are removed from Constitutional Documents
      const taxIdLabel = countryConfig?.labels.taxId || "PAN";
      if (merged["Constitutional Documents"]) {
        merged["Constitutional Documents"] = merged[
          "Constitutional Documents"
        ].filter((d: string) => d !== taxIdLabel && d !== "PAN" && d !== "TAN");
      }

      // Also filter out hidden templates from default documents
      Object.keys(merged).forEach((folder) => {
        merged[folder] = merged[folder].filter((docName: string) => {
          const templateKey = `${folder}:${docName}`;
          return !hiddenTemplates.has(templateKey);
        });
      });

      return merged;
    } else {
      // Filter hidden templates from default documents too
      const filtered = { ...DEFAULT_DOCUMENTS };
      Object.keys(filtered).forEach((folder) => {
        filtered[folder] = filtered[folder].filter((docName: string) => {
          const templateKey = `${folder}:${docName}`;
          return !hiddenTemplates.has(templateKey);
        });
      });
      return filtered;
    }
  }, [documentTemplates, hiddenTemplates, countryCode, countryConfig]);

  const handleView = async (filePath: string) => {
    try {
      const result = await getDownloadUrl(filePath);
      if (result.success && result.url) {
        window.open(result.url, "_blank");
      } else {
        showToast("Failed to get document view URL", "error");
      }
    } catch (err) {
      console.error("View error:", err);
      showToast("Error opening document", "error");
    }
  };

  const handlePreview = async (doc: any) => {
    try {
      const result = await getDownloadUrl(doc.file_path);
      if (result.success && result.url) {
        setPreviewDocument({ ...doc, previewUrl: result.url });
        setIsPreviewModalOpen(true);
      } else {
        showToast("Failed to get document preview URL", "error");
      }
    } catch (err) {
      console.error("Preview error:", err);
      showToast("Error loading document preview", "error");
    }
  };

  // Helper function to get file type icon
  const getFileTypeIcon = (fileName: string) => {
    const ext = fileName?.split(".").pop()?.toLowerCase() || "";
    switch (ext) {
      case "pdf":
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
          </svg>
        );
      case "doc":
      case "docx":
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
          </svg>
        );
      case "jpg":
      case "jpeg":
      case "png":
      case "gif":
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
          </svg>
        );
    }
  };

  const handleExport = async (filePath: string, fileName: string) => {
    try {
      const result = await getDownloadUrl(filePath);
      if (result.success && result.url) {
        const link = document.createElement("a");
        link.href = result.url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Track vault file export
        if (user?.id && currentCompany?.id) {
          trackVaultFileExport(user.id, currentCompany.id, 1);
        }
        showToast("Document downloaded successfully", "success");
      } else {
        showToast("Failed to download document", "error");
      }
    } catch (err) {
      console.error("Export error:", err);
      showToast("Error downloading document", "error");
    }
  };

  const handleRemove = async (docId: string, filePath: string) => {
    if (
      !confirm(
        "Are you sure you want to remove this document? This action cannot be undone.",
      )
    )
      return;

    try {
      const result = await deleteDocument(docId, filePath);
      if (result.success) {
        await fetchVaultDocuments();
        showToast("Document removed successfully", "success");
      } else {
        showToast("Failed to remove document: " + result.error, "error");
      }
    } catch (err) {
      console.error("Remove error:", err);
      showToast("Error removing document", "error");
    }
  };

  const getFinancialYear = (dateStr: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const month = date.getMonth(); // 0-11
    const year = date.getFullYear();

    // In India, FY starts in April (month 3)
    if (month >= 3) {
      return `FY ${year}-${(year + 1).toString().slice(-2)}`;
    } else {
      return `FY ${year - 1}-${year.toString().slice(-2)}`;
    }
  };

  // Helper function to format period information for display
  const formatPeriodInfo = (doc: any): string | null => {
    if (!doc.period_key && !doc.period_financial_year) return null;

    if (doc.period_type === "monthly" && doc.period_key) {
      // Format: "2025-03" -> "March 2025"
      const [year, month] = doc.period_key.split("-");
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      const monthName = monthNames[parseInt(month) - 1];
      return `${monthName} ${year}`;
    } else if (doc.period_type === "quarterly" && doc.period_key) {
      // Format: "Q1-2025" -> "Q1 2025"
      return doc.period_key.replace("-", " ");
    } else if (doc.period_type === "annual" && doc.period_financial_year) {
      // Format: "FY 2024-25"
      return doc.period_financial_year;
    } else if (doc.period_financial_year) {
      return doc.period_financial_year;
    }

    return null;
  };

  // Helper function to get period badge color
  const getPeriodBadgeColor = (periodType: string | null): string => {
    if (!periodType) return "bg-gray-700";
    // Color coding aligned with compliance types:
    // one-time (purple, no recurring), annual (green, recurs annually)
    switch (periodType) {
      case "one-time":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "annual":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "monthly":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "quarterly":
        return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
      default:
        return "bg-gray-700";
    }
  };

  // Helper function to extract financial year from document
  const getFinancialYearFromDoc = (doc: any): string | null => {
    // Prefer period_financial_year if available
    if (doc.period_financial_year) {
      return doc.period_financial_year;
    }
    // Fallback to created_at
    if (doc.created_at) {
      return getFinancialYear(doc.created_at);
    }
    // Fallback to registration_date
    if (doc.registration_date) {
      return getFinancialYear(doc.registration_date);
    }
    return null;
  };

  // Helper function to format relative time
  const formatRelativeTime = (dateStr: string): string => {
    if (!dateStr) return "Unknown";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffMonths < 12) return `${diffMonths} months ago`;
    return `${diffYears} years ago`;
  };

  // Helper function to format file size
  const formatFileSize = (bytes: number | null | undefined): string => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Interface for version groups
  interface VersionGroup {
    documentType: string;
    latestVersion: any;
    yearlyVersions: Map<string, any[]>; // Key: financial year, Value: array of versions
    totalVersions: number;
    folderName: string;
  }

  // Function to group documents by type, then by financial year
  const groupDocumentsByVersion = (documents: any[]): VersionGroup[] => {
    const groups = new Map<string, VersionGroup>();

    documents.forEach((doc) => {
      const docType = doc.document_type;
      if (!docType) return;

      // Get or create group for this document type
      if (!groups.has(docType)) {
        groups.set(docType, {
          documentType: docType,
          latestVersion: doc,
          yearlyVersions: new Map(),
          totalVersions: 0,
          folderName: doc.folder_name || "",
        });
      }

      const group = groups.get(docType)!;
      group.totalVersions++;

      // Get financial year for this document
      const fy = getFinancialYearFromDoc(doc);
      if (fy) {
        if (!group.yearlyVersions.has(fy)) {
          group.yearlyVersions.set(fy, []);
        }
        group.yearlyVersions.get(fy)!.push(doc);
      } else {
        // If no FY, put in "Other" category
        if (!group.yearlyVersions.has("Other")) {
          group.yearlyVersions.set("Other", []);
        }
        group.yearlyVersions.get("Other")!.push(doc);
      }

      // Update latest version if this is newer
      const docDate = doc.created_at || doc.period_key || "";
      const latestDate =
        group.latestVersion.created_at || group.latestVersion.period_key || "";
      if (docDate > latestDate) {
        group.latestVersion = doc;
      }
    });

    // Sort versions within each year (newest first)
    groups.forEach((group) => {
      group.yearlyVersions.forEach((versions, fy) => {
        versions.sort((a, b) => {
          const dateA = a.created_at || a.period_key || "";
          const dateB = b.created_at || b.period_key || "";
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          return dateB.localeCompare(dateA);
        });
      });
    });

    return Array.from(groups.values());
  };

  // Helper function to check if document matches search query
  const matchesSearch = (doc: any, query: string): boolean => {
    if (!query.trim()) return true;
    const lowerQuery = query.toLowerCase();
    const docType = (doc.document_type || "").toLowerCase();
    const folderName = (doc.folder_name || "").toLowerCase();
    const periodInfo = formatPeriodInfo(doc)?.toLowerCase() || "";
    const expiryDate = doc.expiry_date
      ? formatDateForDisplay(doc.expiry_date).toLowerCase()
      : "";

    return (
      docType.includes(lowerQuery) ||
      folderName.includes(lowerQuery) ||
      periodInfo.includes(lowerQuery) ||
      expiryDate.includes(lowerQuery)
    );
  };

  // Helper function to get document status (valid, expiring, expired)
  const getDocumentStatus = (
    doc: any,
  ): "valid" | "expiring" | "expired" | "no-expiry" => {
    if (!doc.expiry_date) return "no-expiry";
    const expiryDate = new Date(doc.expiry_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilExpiry = Math.ceil(
      (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysUntilExpiry < 0) return "expired";
    if (daysUntilExpiry <= 30) return "expiring";
    return "valid";
  };

  // Helper function to get status badge color
  const getStatusBadgeColor = (
    status: "valid" | "expiring" | "expired" | "no-expiry",
  ): string => {
    switch (status) {
      case "valid":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "expiring":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "expired":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  // Helper function to sort documents
  const sortDocuments = (docs: any[], sortBy: typeof sortOption): any[] => {
    const sorted = [...docs];
    switch (sortBy) {
      case "name-asc":
        return sorted.sort((a, b) => {
          const nameA = (a.document_type || "").toLowerCase();
          const nameB = (b.document_type || "").toLowerCase();
          return nameA.localeCompare(nameB);
        });
      case "name-desc":
        return sorted.sort((a, b) => {
          const nameA = (a.document_type || "").toLowerCase();
          const nameB = (b.document_type || "").toLowerCase();
          return nameB.localeCompare(nameA);
        });
      case "date-newest":
        return sorted.sort((a, b) => {
          const dateA = a.period_key || a.created_at || "";
          const dateB = b.period_key || b.created_at || "";
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          return dateB.localeCompare(dateA);
        });
      case "date-oldest":
        return sorted.sort((a, b) => {
          const dateA = a.period_key || a.created_at || "";
          const dateB = b.period_key || b.created_at || "";
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          return dateA.localeCompare(dateB);
        });
      case "expiry":
        return sorted.sort((a, b) => {
          const expiryA = a.expiry_date || "";
          const expiryB = b.expiry_date || "";
          if (!expiryA && !expiryB) return 0;
          if (!expiryA) return 1;
          if (!expiryB) return -1;
          return expiryA.localeCompare(expiryB);
        });
      case "folder":
        return sorted.sort((a, b) => {
          const folderA = (a.folder_name || "").toLowerCase();
          const folderB = (b.folder_name || "").toLowerCase();
          return folderA.localeCompare(folderB);
        });
      default:
        return sorted;
    }
  };

  const allDocuments = (vaultDocuments || [])
    .filter((doc) => {
      // If no FY selected, show all documents
      if (!selectedFY) return true;

      // Prefer period_financial_year if available (for tracker-uploaded docs)
      if (doc.period_financial_year) {
        return doc.period_financial_year === selectedFY;
      }

      // Fallback to registration_date for older documents
      if (doc.registration_date) {
        const docFY = getFinancialYear(doc.registration_date);
        return docFY === selectedFY;
      }

      // If no period or registration date, don't show when FY is selected
      return false;
    })
    .map((doc) => ({
      id: doc.id,
      name: doc.document_type,
      category: doc.folder_name,
      status: "uploaded",
      period: formatPeriodInfo(doc) || null,
    }));

  const handleUpload = async () => {
    if (
      !uploadFormData.file ||
      !uploadFormData.folder ||
      !uploadFormData.documentName ||
      !currentCompany
    ) {
      showToast(
        "Please fill all required fields and select a file.",
        "warning",
      );
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = uploadFormData.file.name.split(".").pop();
      const fileName = `${uploadFormData.documentName.replace(/\s+/g, "_")}_${Date.now()}.${fileExt}`;
      const filePath = `${user?.id}/${currentCompany.id}/${fileName}`;

      // 1. Upload to Storage via server action (works for both Supabase and Passport users)
      const fileArrayBuffer = await uploadFormData.file.arrayBuffer();
      const uploadResult = await uploadFileToStorage(filePath, fileArrayBuffer, uploadFormData.file.type);

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      // 2. Save metadata via Server Action
      const result = await uploadDocument(currentCompany.id, {
        folderName: uploadFormData.folder,
        documentName: uploadFormData.documentName,
        registrationDate: uploadFormData.registrationDate,
        expiryDate: uploadFormData.expiryDate,
        isPortalRequired: uploadFormData.hasNote,
        portalEmail: uploadFormData.externalEmail,
        portalPassword: uploadFormData.externalPassword,
        frequency: uploadFormData.frequency,
        filePath: filePath,
        fileName: uploadFormData.file.name,
        // Period metadata for tracker integration
        periodType: uploadFormData.periodType || undefined,
        periodFinancialYear: uploadFormData.periodFinancialYear || undefined,
        periodKey: uploadFormData.periodKey || undefined,
        requirementId: uploadFormData.requirementId || undefined,
      });

      if (result.success) {
        // Track document upload (vault)
        if (user?.id && currentCompany?.id) {
          await trackDocumentUpload(
            user.id,
            currentCompany.id,
            uploadFormData.documentName,
          ).catch((err) => {
            console.error("Failed to track document upload:", err);
          });
          // Also track as vault file upload
          await trackVaultFileUpload(
            user.id,
            currentCompany.id,
            uploadFormData.file?.type || "unknown",
          ).catch((err) => {
            console.error("Failed to track vault file upload:", err);
          });
        }

        setIsUploadModalOpen(false);
        setUploadFormData({
          folder: "",
          documentName: "",
          registrationDate: "",
          expiryDate: "",
          hasNote: false,
          externalEmail: "",
          externalPassword: "",
          frequency: "annually",
          file: null,
          periodType: "",
          periodFinancialYear: "",
          periodKey: "",
          requirementId: "",
        });
        // Refresh documents list
        await fetchVaultDocuments();
        showToast("Document uploaded successfully!", "success");
      } else {
        showToast("Upload failed: Unknown error", "error");
      }
    } catch (error: any) {
      console.error("Upload failed:", error);
      showToast("Upload failed: " + error.message, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const toggleDocumentSelection = (docId: string) => {
    setSelectedDocuments((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(docId)) {
        newSet.delete(docId);
      } else {
        newSet.add(docId);
      }
      return newSet;
    });
  };

  const toggleDocumentSelectionForSend = (docId: string) => {
    setSelectedDocumentsToSend((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(docId)) {
        newSet.delete(docId);
      } else {
        newSet.add(docId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (allDocuments.length === 0) return;
    if (
      selectedDocuments.size === allDocuments.length &&
      allDocuments.length > 0
    ) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(allDocuments.map((doc) => doc.id)));
    }
  };

  const handleSelectAllForSend = () => {
    if (selectedDocumentsToSend.size === allDocuments.length) {
      setSelectedDocumentsToSend(new Set());
    } else {
      setSelectedDocumentsToSend(new Set(allDocuments.map((doc) => doc.id)));
    }
  };

  const handleSendNext = () => {
    if (selectedDocumentsToSend.size > 0) {
      setIsSendModalOpen(false);
      setIsEmailTemplateOpen(true);
    }
  };
  const [inviteEmail, setInviteEmail] = useState("colleague@example.com");
  const [inviteName, setInviteName] = useState("John Doe");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);

  // Get current month name
  const getCurrentMonth = (): string => {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return months[new Date().getMonth()];
  };

  const [isComplianceScoreModalOpen, setIsComplianceScoreModalOpen] =
    useState(false);

  // Track tracker tab opened (only when switching TO tracker, not on every render)
  useEffect(() => {
    if (activeTab === "tracker" && prevActiveTab.current !== "tracker" && currentCompany?.id && user?.id) {
      trackTrackerTabOpened(user.id, currentCompany.id);
    }
  }, [activeTab, currentCompany?.id, user?.id]);

  // Date normalization utilities for consistency
  // Normalize date to UTC midnight for consistent comparisons (avoids timezone issues)
  const normalizeDate = useCallback((
    dateStr: string | Date | null | undefined,
  ): Date | null => {
    if (!dateStr) return null;
    try {
      const date = dateStr instanceof Date ? dateStr : new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      // Normalize to UTC midnight for consistent comparisons
      return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      );
    } catch {
      return null;
    }
  }, []);

  // Compare dates ignoring time (for due date comparisons)
  const compareDates = (
    date1: string | Date | null,
    date2: string | Date | null,
  ): number => {
    const d1 = normalizeDate(date1);
    const d2 = normalizeDate(date2);
    if (!d1 && !d2) return 0;
    if (!d1) return 1;
    if (!d2) return -1;
    return d1.getTime() - d2.getTime();
  };

  // Check if date is in the future (for validation)
  const isDateInFuture = (dateStr: string | Date | null): boolean => {
    const date = normalizeDate(dateStr);
    if (!date) return false;
    const today = normalizeDate(new Date());
    if (!today) return false;
    return date.getTime() > today.getTime();
  };

  // Validate due date for upcoming items
  const validateDueDate = (
    dueDate: string,
    status: string,
  ): { valid: boolean; error?: string } => {
    if (!dueDate) {
      return { valid: false, error: "Due date is required" };
    }

    const normalized = normalizeDate(dueDate);
    if (!normalized) {
      return { valid: false, error: "Invalid date format" };
    }

    // For "upcoming" status, due date should be in the future
    if (status === "upcoming") {
      if (!isDateInFuture(dueDate)) {
        return {
          valid: false,
          error: "Due date for upcoming items must be in the future",
        };
      }
    }

    return { valid: true };
  };

  // Helper function to format date for display (consistent format)
  // Memoized to prevent recreation on every render
  const formatDate = useCallback((dateStr: string): string => {
    try {
      const date = normalizeDate(dateStr);
      if (!date) return dateStr;
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
    } catch {
      return dateStr;
    }
  }, []); // normalizeDate is a pure function, stable across renders

  // Helper function to format date with full month name (consistent format)
  const formatDateForDisplay = (dateStr: string): string => {
    if (!dateStr) return "";
    try {
      const date = normalizeDate(dateStr);
      if (!date) return dateStr;
      // Use UTC to avoid timezone issues
      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  // Format date as ISO string for storage (consistent format)
  const formatDateForStorage = (
    dateStr: string | Date | null,
  ): string | null => {
    const date = normalizeDate(dateStr);
    if (!date) return null;
    // Return ISO string in YYYY-MM-DD format
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  };

  // Memoized penalty calculation function
  const calculatePenaltyMemoized = useCallback(
    (
      penaltyStr: string | null | undefined,
      daysDelayed: number | null,
      penaltyBaseAmount?: number | null, // Base amount for interest calculations
      penaltyConfig?: Record<string, unknown> | null, // Structured config from penalty builder
    ): string => {
      // If no delay or penalty string is empty, return '-'
      if (
        daysDelayed === null ||
        daysDelayed <= 0 ||
        !penaltyStr ||
        penaltyStr.trim() === ""
      ) {
        return "-";
      }

      const penalty = penaltyStr.trim();

      // Handle NULL (from database)
      if (penalty === "NULL" || penalty === "null" || penalty === "") {
        return "Refer to Act";
      }

      // Simple daily rate: "50", "100", "200"
      if (/^\d+$/.test(penalty)) {
        const dailyRate = parseInt(penalty, 10);
        if (!isNaN(dailyRate) && dailyRate > 0) {
          return formatCurrency(
            Math.round(dailyRate * daysDelayed),
            countryCode,
          );
        }
      }

      // Complex format with max cap: "100|500000" (daily|max)
      if (/^\d+\|\d+$/.test(penalty)) {
        const [dailyRateStr, maxCapStr] = penalty.split("|");
        const dailyRate = parseInt(dailyRateStr, 10);
        const maxCap = parseInt(maxCapStr, 10);

        if (!isNaN(dailyRate) && dailyRate > 0) {
          let calculated = dailyRate * daysDelayed;
          if (!isNaN(maxCap) && maxCap > 0) {
            calculated = Math.min(calculated, maxCap);
          }
          return formatCurrency(Math.round(calculated), countryCode);
        }
      }

      // Extract daily rate from penalty string (e.g., "â‚¹100/day", "100/day")
      // Use country-specific currency symbol
      const currencySymbol = countryConfig.currency.symbol;
      const currencySymbolEscaped = currencySymbol.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      let dailyRateMatch = penalty.match(/(\d+)\/day\s*\([^)]*NIL[^)]*\)/i);
      if (!dailyRateMatch) {
        dailyRateMatch = penalty.match(
          new RegExp(
            `(?:${currencySymbolEscaped})?[\\d,]+(?:\\.[\\d]+)?\\/day`,
            "i",
          ),
        );
      }
      if (dailyRateMatch) {
        const rateStr =
          dailyRateMatch[1] ||
          dailyRateMatch[0]
            .replace(new RegExp(currencySymbolEscaped, "gi"), "")
            .replace(/\/day/gi, "")
            .replace(/,/g, "");
        const dailyRate = parseFloat(rateStr.replace(/,/g, ""));
        if (!isNaN(dailyRate) && dailyRate > 0) {
          let calculatedPenalty = dailyRate * daysDelayed;

          // Check for maximum limit
          const maxMatch = penalty.match(
            new RegExp(
              `max\\s*(?:${currencySymbolEscaped})?[\\d,]+(?:\\.[\\d]+)?`,
              "i",
            ),
          );
          if (maxMatch) {
            const maxStr = maxMatch[0]
              .replace(
                new RegExp(`max\\s*(?:${currencySymbolEscaped})?`, "gi"),
                "",
              )
              .replace(/,/g, "");
            const maxAmount = parseFloat(maxStr);
            if (!isNaN(maxAmount) && maxAmount > 0) {
              calculatedPenalty = Math.min(calculatedPenalty, maxAmount);
            }
          }

          return formatCurrency(calculatedPenalty, countryCode);
        }
      }

      // Handle "200/day + 10000-100000" - extract daily rate before the +
      const dailyWithRangeMatch = penalty.match(/(\d+)\/day\s*\+\s*[\d-]+/i);
      if (dailyWithRangeMatch) {
        const dailyRate = parseFloat(dailyWithRangeMatch[1].replace(/,/g, ""));
        if (!isNaN(dailyRate) && dailyRate > 0) {
          return formatCurrency(
            Math.round(dailyRate * daysDelayed),
            countryCode,
          );
        }
      }

      // Handle "2%/month + 5/day" - extract daily rate after the +
      const interestPlusDailyMatch = penalty.match(
        /[\d.]+%[^+]*\+\s*(\d+)\/day/i,
      );
      if (interestPlusDailyMatch) {
        const dailyRate = parseFloat(
          interestPlusDailyMatch[1].replace(/,/g, ""),
        );
        if (!isNaN(dailyRate) && dailyRate > 0) {
          return formatCurrency(
            Math.round(dailyRate * daysDelayed),
            countryCode,
          );
        }
      }

      // Handle range formats like "25000-300000" - extract minimum
      const rangeMatch = penalty.match(/(\d+)\s*-\s*(\d+)/);
      if (rangeMatch && !penalty.includes("%") && !penalty.includes("/day")) {
        const minAmount = parseFloat(rangeMatch[1].replace(/,/g, ""));
        if (!isNaN(minAmount) && minAmount > 0) {
          return `${formatCurrency(Math.round(minAmount), countryCode)} (minimum)`;
        }
      }

      // Check for explicit fixed penalty amounts
      const fixedKeywords = /(?:fixed|one-time|one time|flat|lump)/i;
      if (fixedKeywords.test(penalty)) {
        let fixedMatch = penalty.match(
          new RegExp(`${currencySymbolEscaped}[\\d,]+(?:\\.[\\d]+)?`, "i"),
        );
        if (!fixedMatch) {
          const plainNumberMatch = penalty.match(/[\d,]+(?:\.[\d]+)?/i);
          if (plainNumberMatch) {
            const amount = plainNumberMatch[0].replace(/,/g, "");
            const numAmount = parseFloat(amount);
            if (!isNaN(numAmount) && numAmount > 0) {
              return formatCurrency(numAmount, countryCode);
            }
          }
        } else {
          // Extract amount from fixed match and format with country currency
          const amountStr = fixedMatch[0]
            .replace(new RegExp(currencySymbolEscaped, "gi"), "")
            .replace(/,/g, "");
          const amount = parseFloat(amountStr);
          if (!isNaN(amount) && amount > 0) {
            return formatCurrency(amount, countryCode);
          }
          return fixedMatch[0];
        }
      }

      // Plain number as daily rate (fallback for text format)
      const plainNumberMatch = penalty.match(/^[\d,]+(?:\.[\d]+)?$/i);
      if (
        plainNumberMatch &&
        !penalty.includes("/day") &&
        !penalty.includes("Interest") &&
        !penalty.includes("+")
      ) {
        const amount = plainNumberMatch[0].replace(/,/g, "");
        const numAmount = parseFloat(amount);
        if (!isNaN(numAmount) && numAmount > 0) {
          const calculatedPenalty = numAmount * daysDelayed;
          return formatCurrency(calculatedPenalty, countryCode);
        }
      }

      // Check for penalties with Interest - IMPROVED: Calculate if base amount is available
      if (
        penalty.includes("Interest") ||
        penalty.includes("+ Interest") ||
        penalty.includes("interest")
      ) {
        // Try to calculate interest if base amount is available
        if (penaltyBaseAmount && penaltyBaseAmount > 0) {
          // Extract interest rate from penalty string
          // Common formats: "1%/month", "12%/year", "1.5%/month", "Interest @ 1%/month", "u/s 234B & 234C"
          const interestRateMatch = penalty.match(
            /([\d.]+)\s*%\s*(?:\/|\s*)(month|year|annum|annually|per month|per year)/i,
          );

          if (interestRateMatch) {
            const rate = parseFloat(interestRateMatch[1]);
            const period = interestRateMatch[2].toLowerCase();

            if (!isNaN(rate) && rate > 0 && daysDelayed) {
              // Calculate interest based on period
              let interest = 0;

              if (period.includes("month")) {
                // Monthly interest: (principal * rate/100) * (days/30)
                const months = daysDelayed / 30;
                interest = ((penaltyBaseAmount * rate) / 100) * months;
              } else if (
                period.includes("year") ||
                period.includes("annum") ||
                period.includes("annually")
              ) {
                // Annual interest: (principal * rate/100) * (days/365)
                const years = daysDelayed / 365;
                interest = ((penaltyBaseAmount * rate) / 100) * years;
              }

              if (interest > 0) {
                return `${formatCurrency(Math.round(interest), countryCode)} (Interest @ ${rate}%/${period.includes("month") ? "month" : "year"} on ${formatCurrency(penaltyBaseAmount, countryCode)})`;
              }
            }
          }

          // Special handling for Income Tax sections 234B & 234C (default 1% per month)
          if (
            penalty.includes("234B") ||
            penalty.includes("234C") ||
            penalty.includes("u/s 234") ||
            penalty.includes("section 234")
          ) {
            if (daysDelayed) {
              // Default to 1% per month for Income Tax interest
              const months = daysDelayed / 30;
              const interest = penaltyBaseAmount * 0.01 * months;
              return `${formatCurrency(Math.round(interest), countryCode)} (Interest @ 1%/month u/s 234B/234C on ${formatCurrency(penaltyBaseAmount, countryCode)})`;
            }
          }

          // If rate format not found but base amount exists, try to extract any percentage
          const anyPercentMatch = penalty.match(/([\d.]+)\s*%/i);
          if (anyPercentMatch && daysDelayed) {
            const rate = parseFloat(anyPercentMatch[1]);
            if (!isNaN(rate) && rate > 0) {
              // Default to monthly calculation if period not specified
              const months = daysDelayed / 30;
              const interest = ((penaltyBaseAmount * rate) / 100) * months;
              return `${formatCurrency(Math.round(interest), countryCode)} (Interest @ ${rate}%/month on ${formatCurrency(penaltyBaseAmount, countryCode)})`;
            }
          }

          // Fall back to penalty_config if set via the penalty builder
          if (penaltyConfig && daysDelayed) {
            const cfg = penaltyConfig as any;
            if (cfg.type === 'interest' && cfg.rate > 0) {
              const rate = cfg.rate as number;
              const period = (cfg.period as string) || 'month';
              const months = period === 'year' ? daysDelayed / 365 * 12 : daysDelayed / 30;
              const interest = ((penaltyBaseAmount * rate) / 100) * (period === 'year' ? daysDelayed / 365 : daysDelayed / 30);
              return `${formatCurrency(Math.round(interest), countryCode)} (Interest @ ${rate}%/${period} on ${formatCurrency(penaltyBaseAmount, countryCode)})`;
            }
          }
        }

        // Base amount is set but rate can't be determined — prompt for penalty config
        if (penaltyBaseAmount && penaltyBaseAmount > 0) {
          return "Cannot calculate - Set interest rate via Edit → Penalty Config";
        }
        return "Cannot calculate - Please provide principal amount (Base Amount) for interest calculation";
      }

      // Check for vague "as per Act" references
      if (/as per.*Act/i.test(penalty) || /as per.*guidelines/i.test(penalty)) {
        // If penalty_config has structured data, use it instead
        if (penaltyConfig && daysDelayed) {
          const cfg = penaltyConfig as any;
          if (cfg.type === 'flat' && cfg.amount > 0) {
            return formatCurrency(cfg.amount, countryCode);
          }
          if (cfg.type === 'daily' && cfg.rate > 0) {
            return formatCurrency(Math.round(cfg.rate * daysDelayed), countryCode);
          }
          if ((cfg.type === 'interest' || cfg.type === 'percentage') && cfg.rate > 0 && penaltyBaseAmount) {
            const period = (cfg.period as string) || 'month';
            const interest = ((penaltyBaseAmount * cfg.rate) / 100) * (period === 'year' ? daysDelayed / 365 : daysDelayed / 30);
            return `${formatCurrency(Math.round(interest), countryCode)} (@ ${cfg.rate}%/${period} on ${formatCurrency(penaltyBaseAmount, countryCode)})`;
          }
        }
        return "Refer to Act";
      }

      // Check for penalties that are too complex
      if (penalty.includes("+") && !penalty.includes("/day")) {
        return "Cannot calculate - Complex penalty structure requires additional information";
      }

      return "Cannot calculate - Insufficient information";
    },
    [],
  );

  // Memoized delay calculation
  const calculateDelayMemoized = useCallback(
    (dueDateStr: string, status: string): number | null => {
      // For not_started, pending, or overdue status, calculate delay if date has passed
      if (status === "completed" || status === "upcoming") return null;

      try {
        const months: { [key: string]: number } = {
          Jan: 0,
          Feb: 1,
          Mar: 2,
          Apr: 3,
          May: 4,
          Jun: 5,
          Jul: 6,
          Aug: 7,
          Sep: 8,
          Oct: 9,
          Nov: 10,
          Dec: 11,
        };
        const parts = dueDateStr.split(" ");
        if (parts.length >= 3) {
          const day = parseInt(parts[1].replace(",", ""));
          const month = months[parts[0]];
          const year = parseInt(parts[2]);
          const dueDate = new Date(year, month, day);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          dueDate.setHours(0, 0, 0, 0);
          const diffTime = today.getTime() - dueDate.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          // Return delay if date has passed (diffDays > 0)
          return diffDays > 0 ? diffDays : null;
        }
      } catch {
        // Invalid date format
      }
      return null;
    },
    [],
  );

  // Validate status transition
  const isValidStatusTransition = (
    oldStatus: string,
    newStatus: string,
  ): { valid: boolean; reason?: string } => {
    // Define valid status transitions
    const validTransitions: Record<string, string[]> = {
      not_started: ["upcoming", "pending", "overdue", "completed"],
      upcoming: ["pending", "overdue", "completed", "not_started"],
      pending: ["completed", "overdue", "upcoming", "not_started"],
      overdue: ["completed", "pending", "upcoming", "not_started"],
      completed: ["pending", "overdue", "upcoming", "not_started"], // Allow reopening completed items
    };

    // Same status is always valid (no-op)
    if (oldStatus === newStatus) {
      return { valid: true };
    }

    // Check if transition is allowed
    const allowedTransitions = validTransitions[oldStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      return {
        valid: false,
        reason: `Cannot change status from "${oldStatus}" to "${newStatus}". Valid transitions: ${allowedTransitions.join(", ")}`,
      };
    }

    return { valid: true };
  };

  // Handle status change
  const handleStatusChange = async (
    requirementId: string,
    newStatus: "not_started" | "upcoming" | "pending" | "overdue" | "completed",
  ) => {
    if (!currentCompany) return;

    try {
      // Get old status for validation and tracking
      const oldRequirement = (regulatoryRequirements || []).find(
        (req) => req.id === requirementId,
      );
      if (!oldRequirement) {
        showToast("Requirement not found", "error");
        return;
      }

      const oldStatus = oldRequirement.status;

      // Validate status transition
      const validation = isValidStatusTransition(oldStatus, newStatus);
      if (!validation.valid) {
        showToast(validation.reason || "Invalid status transition", "error");
        return;
      }

      // For critical items or moving to completed, show confirmation
      if (
        (oldRequirement.is_critical || oldStatus === "overdue") &&
        newStatus === "completed"
      ) {
        if (
          !confirm(
            `Are you sure you want to mark this ${oldRequirement.is_critical ? "critical " : ""}requirement as completed?`,
          )
        ) {
          return;
        }
      }

      // Optimistic update — immediately reflect the change in UI
      setRegulatoryRequirements((prev) =>
        prev.map((req) =>
          req.id === requirementId ? { ...req, status: newStatus } : req,
        ),
      );

      const result = await updateRequirementStatus(
        requirementId,
        currentCompany.id,
        newStatus,
      );
      if (result.success) {
        // Track status change (fire-and-forget)
        if (user?.id && currentCompany?.id) {
          trackStatusChange(
            user.id,
            currentCompany.id,
            requirementId,
            oldStatus,
            result.actualStatus || newStatus,
          ).catch((err) => {
            console.error("Failed to track status change:", err);
          });
        }

        // Reconcile with actual status from server (may differ if validation overrode it)
        const actualStatus:
          | "not_started"
          | "upcoming"
          | "pending"
          | "overdue"
          | "completed" = (result.actualStatus || newStatus) as
          | "not_started"
          | "upcoming"
          | "pending"
          | "overdue"
          | "completed";

        if (actualStatus !== newStatus || result.missingDocs) {
          setRegulatoryRequirements((prev) =>
            prev.map((req) =>
              req.id === requirementId
                ? {
                    ...req,
                    status: actualStatus,
                    status_reason: result.missingDocs
                      ? `Missing documents: ${result.missingDocs.join(", ")}`
                      : req.status_reason,
                  }
                : req,
            ),
          );
        }

        // Show appropriate message
        if (
          result.missingDocs &&
          result.missingDocs.length > 0 &&
          actualStatus === "completed"
        ) {
          showToast(
            `Status updated to completed. Note: ${result.missingDocs.length} required document(s) still pending. Admin has been notified.`,
            "success",
          );
        } else {
          showToast("Status updated successfully", "success");
        }
      } else {
        // Roll back optimistic update on failure
        setRegulatoryRequirements((prev) =>
          prev.map((req) =>
            req.id === requirementId ? { ...req, status: oldStatus } : req,
          ),
        );
        showToast(`Failed to update status: ${result.error}`, "error");
      }
    } catch (error: any) {
      console.error("Error updating status:", error);
      showToast(`Error: ${error.message}`, "error");
    }
  };

  // Helper function to detect notice type from document name (for metadata/priority flagging)
  const detectNoticeType = (
    documentName: string,
  ): {
    type?: string;
    formCode?: string;
    section?: string;
    priority?: "low" | "medium" | "high";
    description?: string;
  } | null => {
    if (!countryConfig?.regulatory?.noticeTypes) return null;

    const docLower = documentName.toLowerCase();
    const noticeTypes = countryConfig.regulatory.noticeTypes;

    // Check for exact form code matches first (e.g., DRC-01, ASMT-10)
    for (const [key, notice] of Object.entries(noticeTypes)) {
      const formCodeLower = notice.formCode.toLowerCase();
      if (
        docLower.includes(formCodeLower) ||
        docLower.includes(key.toLowerCase())
      ) {
        return {
          type: notice.type,
          formCode: notice.formCode,
          section: notice.section,
          priority: notice.priority,
          description: notice.description,
        };
      }
    }

    // Check for section-based notices (e.g., Section 142, Section 143)
    for (const [key, notice] of Object.entries(noticeTypes)) {
      if (notice.section) {
        const sectionLower = notice.section.toLowerCase();
        if (docLower.includes(sectionLower)) {
          return {
            type: notice.type,
            formCode: notice.formCode,
            section: notice.section,
            priority: notice.priority,
            description: notice.description,
          };
        }
      }
    }

    return null;
  };

  // Helper to get form frequency for a requirement
  const getFormFrequency = useCallback((requirement: string): string | null => {
    if (!countryConfig?.regulatory?.formFrequencies) return null;

    const reqLower = requirement.toLowerCase();

    // Try to match requirement to form name
    for (const [formName, frequency] of Object.entries(
      countryConfig.regulatory.formFrequencies,
    )) {
      if (reqLower.includes(formName.toLowerCase())) {
        return frequency;
      }
    }
    return null;
  }, [countryConfig?.regulatory?.formFrequencies]);

  // Helper to find relevant legal sections for a requirement
  const getRelevantLegalSections = useCallback((
    requirement: string,
    category: string,
  ): Array<{
    act: string;
    section: string;
    description: string;
    relevance: string;
  }> => {
    if (!countryConfig?.regulatory?.legalSections) return [];

    const reqLower = requirement.toLowerCase();
    const relevantSections: Array<{
      act: string;
      section: string;
      description: string;
      relevance: string;
    }> = [];

    // Match based on requirement text and category
    Object.values(countryConfig.regulatory.legalSections).forEach((section) => {
      const sectionLower = section.section.toLowerCase();
      const actLower = section.act.toLowerCase();

      if (
        reqLower.includes(sectionLower) ||
        reqLower.includes(actLower) ||
        (category === "GST" && actLower.includes("gst")) ||
        (category === "Income Tax" && actLower.includes("income tax")) ||
        (category === "RoC" && actLower.includes("companies act"))
      ) {
        relevantSections.push(section);
      }
    });

    return relevantSections;
  }, [countryConfig?.regulatory?.legalSections]);

  // Helper to get authority for category
  const getAuthorityForCategory = useCallback((category: string): string | null => {
    if (!countryConfig?.regulatory?.authorities) return null;

    const categoryMap: Record<
      string,
      keyof typeof countryConfig.regulatory.authorities
    > = {
      GST: "indirectTax",
      "Income Tax": "tax",
      RoC: "corporate",
      Payroll: "labor",
      "Labour Law": "labor",
      Renewals: "registration",
    };

    const authorityKey = categoryMap[category];
    return authorityKey
      ? countryConfig.regulatory.authorities[authorityKey] || null
      : null;
  }, [countryConfig?.regulatory?.authorities]);

  // Helper to map folder names to compliance categories (country-aware)
  const getCategoryFromFolder = (folderName: string): string | null => {
    if (!countryConfig) return null;

    // Country-specific folder mappings
    if (countryCode === "IN") {
      const folderMap: Record<string, string> = {
        "GST Returns": "GST",
        "Income Tax Returns": "Income Tax",
        "ROC Filings": "RoC",
        "Labour Law Compliance": "Payroll",
        Renewals: "Renewals",
        "Other Compliance Documents": "Other",
        "Professional Tax": "Prof. Tax",
        "Constitutional Documents": "Other",
        "Financials and licenses": "Other",
        "Taxation & GST Compliance": "GST",
        "Regulatory & MCA Filings": "RoC",
      };
      return folderMap[folderName] || null;
    } else if (["AE", "SA", "OM", "QA", "BH"].includes(countryCode || "")) {
      // GCC countries
      const folderMap: Record<string, string> = {
        "VAT & Tax Compliance": "VAT",
        "Corporate & Regulatory Filings": "Corporate Tax",
        "Constitutional Documents": "Other",
        "Financials and licenses": "Other",
      };
      return folderMap[folderName] || null;
    } else if (countryCode === "US") {
      // USA
      const folderMap: Record<string, string> = {
        "Federal Tax Returns": "Federal Tax",
        "State Tax Returns": "State Tax",
        "Business License & Registration": "Business License",
        "Constitutional Documents": "Other",
        "Financials and licenses": "Other",
      };
      return folderMap[folderName] || null;
    }

    // Fallback
    return null;
  };

  // Get relevant forms for folder (country-aware)
  const getRelevantFormsForFolder = (folderName: string): string[] => {
    const category = getCategoryFromFolder(folderName);
    if (!category || !countryConfig?.regulatory?.commonForms) return [];

    const categoryLower = category.toLowerCase();
    const forms = countryConfig.regulatory.commonForms.filter((form) => {
      const formLower = form.toLowerCase();

      // India-specific patterns
      if (countryCode === "IN") {
        if (
          categoryLower === "gst" &&
          (formLower.includes("gstr") ||
            formLower.includes("gst") ||
            formLower.includes("cmp") ||
            formLower.includes("itc") ||
            formLower.includes("iff"))
        )
          return true;
        if (
          categoryLower === "income tax" &&
          (formLower.includes("itr") ||
            formLower.includes("form 24") ||
            formLower.includes("form 26") ||
            formLower.includes("form 27"))
        )
          return true;
        if (
          (categoryLower === "roc" || categoryLower === "mca") &&
          (formLower.includes("mgt") ||
            formLower.includes("aoc") ||
            formLower.includes("dir") ||
            formLower.includes("pas") ||
            formLower.includes("ben") ||
            formLower.includes("inc") ||
            formLower.includes("adt") ||
            formLower.includes("cra") ||
            formLower.includes("llp"))
        )
          return true;
        if (
          (categoryLower === "payroll" || categoryLower === "labour law") &&
          (formLower.includes("ecr") ||
            formLower.includes("form 5a") ||
            formLower.includes("form 2") ||
            formLower.includes("form 10") ||
            formLower.includes("form 19"))
        )
          return true;
      }
      // GCC countries
      else if (["AE", "SA", "OM", "QA", "BH"].includes(countryCode || "")) {
        if (
          (categoryLower === "vat" || categoryLower === "tax") &&
          (formLower.includes("vat") ||
            formLower.includes("tax return") ||
            formLower.includes("corporate tax"))
        )
          return true;
        if (
          categoryLower === "corporate" &&
          (formLower.includes("trade license") ||
            formLower.includes("commercial registration") ||
            formLower.includes("cr"))
        )
          return true;
      }
      // USA
      else if (countryCode === "US") {
        if (
          (categoryLower === "federal tax" || categoryLower === "state tax") &&
          (formLower.includes("tax") ||
            formLower.includes("return") ||
            formLower.includes("ein"))
        )
          return true;
        if (
          categoryLower === "business license" &&
          (formLower.includes("license") ||
            formLower.includes("registration") ||
            formLower.includes("report"))
        )
          return true;
      }

      return false;
    });

    return forms;
  };

  // Get authority for folder
  const getAuthorityForFolder = (folderName: string): string | null => {
    const category = getCategoryFromFolder(folderName);
    return category ? getAuthorityForCategory(category) : null;
  };

  // Suggest folders based on document name (country-aware)
  const suggestFoldersForDocument = (documentName: string): string[] => {
    const docLower = documentName.toLowerCase();
    const suggestions: string[] = [];

    if (countryCode === "IN") {
      // India-specific patterns
      if (
        docLower.includes("gstr") ||
        docLower.includes("gst") ||
        docLower.includes("cmp-") ||
        docLower.includes("itc-") ||
        docLower.includes("iff")
      ) {
        suggestions.push("Taxation & GST Compliance");
      }
      if (
        docLower.includes("itr") ||
        docLower.includes("form 24") ||
        docLower.includes("form 26") ||
        docLower.includes("form 27") ||
        docLower.includes("tds") ||
        docLower.includes("tcs")
      ) {
        suggestions.push("Taxation & GST Compliance");
      }
      if (
        docLower.includes("mgt") ||
        docLower.includes("aoc") ||
        docLower.includes("roc") ||
        docLower.includes("dir-") ||
        docLower.includes("pas-") ||
        docLower.includes("ben-") ||
        docLower.includes("inc-") ||
        docLower.includes("adt-") ||
        docLower.includes("cra-") ||
        docLower.includes("llp form")
      ) {
        suggestions.push("Regulatory & MCA Filings");
      }
      if (
        docLower.includes("epf") ||
        docLower.includes("esi") ||
        docLower.includes("ecr") ||
        docLower.includes("form 5a") ||
        docLower.includes("form 2") ||
        docLower.includes("form 10") ||
        docLower.includes("form 19")
      ) {
        suggestions.push("Labour Law Compliance");
      }
    } else if (["AE", "SA", "OM", "QA", "BH"].includes(countryCode || "")) {
      // GCC countries
      if (
        docLower.includes("vat") ||
        docLower.includes("tax return") ||
        docLower.includes("corporate tax") ||
        docLower.includes("zakat")
      ) {
        suggestions.push("VAT & Tax Compliance");
      }
      if (
        docLower.includes("trade license") ||
        docLower.includes("commercial registration") ||
        docLower.includes("cr") ||
        docLower.includes("ded") ||
        docLower.includes("moci")
      ) {
        suggestions.push("Corporate & Regulatory Filings");
      }
    } else if (countryCode === "US") {
      // USA
      if (
        docLower.includes("federal") ||
        docLower.includes("irs") ||
        docLower.includes("form 1120") ||
        docLower.includes("form 1065")
      ) {
        suggestions.push("Federal Tax Returns");
      }
      if (docLower.includes("state") || docLower.includes("sales tax")) {
        suggestions.push("State Tax Returns");
      }
      if (
        docLower.includes("license") ||
        docLower.includes("registration") ||
        docLower.includes("ein") ||
        docLower.includes("annual report")
      ) {
        suggestions.push("Business License & Registration");
      }
    }

    return suggestions;
  };

  // Get folder description with authority and form count
  const getFolderDescription = (
    folderName: string,
  ): { authority: string | null; formCount: number } => {
    const authority = getAuthorityForFolder(folderName);
    const forms = getRelevantFormsForFolder(folderName);
    return {
      authority,
      formCount: forms.length,
    };
  };

  // Get legal sections for document
  const getLegalSectionsForDocument = (
    documentName: string,
    folderName: string,
  ): Array<{
    act: string;
    section: string;
    description: string;
    relevance: string;
  }> => {
    const category = getCategoryFromFolder(folderName);
    if (!category) return [];

    return getRelevantLegalSections(documentName, category);
  };

  // Helper function to map document name to folder based on category (country-aware)
  const getFolderForDocument = (
    documentName: string,
    category: string,
  ): string => {
    // Check if document template exists
    const template = documentTemplates.find(
      (t) =>
        t.document_name.toLowerCase() === documentName.toLowerCase() ||
        documentName.toLowerCase().includes(t.document_name.toLowerCase()),
    );
    if (template) return template.folder_name;

    const docLower = documentName.toLowerCase();

    // Use country config patterns if available, with fallback to hardcoded patterns
    const patterns = countryConfig?.regulatory?.documentPatterns;

    // Country-specific document pattern matching
    if (countryCode === "IN") {
      // India-specific patterns
      const categoryMap: Record<string, string> = {
        GST: "GST Returns",
        "Income Tax": "Income Tax Returns",
        RoC: "ROC Filings",
        "Labour Law": "Labour Law Compliance",
        "LLP Act": "ROC Filings",
        "Prof. Tax": "Professional Tax",
        Payroll: "Labour Law Compliance",
        Others: "Other Compliance Documents",
        Renewals: "Renewals",
      };

      // Enhanced pattern matching using country config (with fallback)
      if (patterns) {
        // Check tax patterns (GST, Income Tax, TDS, ITR, notices) - all map to Income Tax or GST
        if (
          patterns.tax &&
          patterns.tax.some((pattern) =>
            docLower.includes(pattern.toLowerCase()),
          )
        ) {
          // GST patterns
          if (
            patterns.tax.some(
              (p) =>
                ["gstr", "gst", "cmp-", "itc-", "iff"].some((gst) =>
                  p.toLowerCase().includes(gst),
                ) && docLower.includes(p.toLowerCase()),
            )
          ) {
            return "GST Returns";
          }
          // Income Tax patterns (TDS, ITR, notices)
          if (
            patterns.tax.some(
              (p) =>
                [
                  "itr",
                  "form 24q",
                  "form 26q",
                  "form 27q",
                  "form 27eq",
                  "tds",
                  "tcs",
                  "drc-",
                  "asmt-",
                  "section 142",
                  "section 143",
                  "section 156",
                ].some((it) => p.toLowerCase().includes(it)) &&
                docLower.includes(p.toLowerCase()),
            )
          ) {
            return "Income Tax Returns";
          }
          // Default tax pattern match
          return "Income Tax Returns";
        }

        // Check corporate patterns (MCA/RoC) - map to RoC
        if (
          patterns.corporate &&
          patterns.corporate.some((pattern) =>
            docLower.includes(pattern.toLowerCase()),
          )
        ) {
          return "ROC Filings";
        }

        // Check labor patterns (EPFO/ESIC) - map to Payroll category
        if (
          patterns.labor &&
          patterns.labor.some((pattern) =>
            docLower.includes(pattern.toLowerCase()),
          )
        ) {
          return "Labour Law Compliance";
        }

        // Check notice patterns - map to Others/Renewals
        if (
          patterns.notices &&
          patterns.notices.some((pattern) =>
            docLower.includes(pattern.toLowerCase()),
          )
        ) {
          // Registration-related notices go to Renewals, others to Other Compliance Documents
          if (docLower.includes("reg-17") || docLower.includes("reg-19")) {
            return "Renewals";
          }
          return "Other Compliance Documents";
        }
      }

      // Fallback to hardcoded patterns for backward compatibility
      if (docLower.includes("gstr") || docLower.includes("gst")) {
        return "GST Returns";
      }
      if (
        docLower.includes("form 24q") ||
        docLower.includes("form 26q") ||
        docLower.includes("form 27q") ||
        docLower.includes("form 27eq") ||
        docLower.includes("tds") ||
        docLower.includes("tcs") ||
        docLower.includes("itr") ||
        docLower.includes("drc-") ||
        docLower.includes("asmt-") ||
        docLower.includes("section 142") ||
        docLower.includes("section 143") ||
        docLower.includes("section 156")
      ) {
        return "Income Tax Returns";
      }
      if (
        docLower.includes("pf") ||
        docLower.includes("esi") ||
        docLower.includes("epf") ||
        docLower.includes("epfo") ||
        docLower.includes("labour") ||
        docLower.includes("ecr") ||
        docLower.includes("form 5a") ||
        docLower.includes("form 2") ||
        docLower.includes("form 10c") ||
        docLower.includes("form 10d") ||
        docLower.includes("form 19")
      ) {
        return "Labour Law Compliance";
      }
      if (
        docLower.includes("mgt") ||
        docLower.includes("aoc") ||
        docLower.includes("roc") ||
        docLower.includes("form 11") ||
        docLower.includes("form 8") ||
        docLower.includes("dir-") ||
        docLower.includes("pas-") ||
        docLower.includes("ben-") ||
        docLower.includes("inc-22a") ||
        docLower.includes("adt-01") ||
        docLower.includes("cra-2") ||
        docLower.includes("llp form")
      ) {
        return "ROC Filings";
      }
      if (
        docLower.includes("reg-17") ||
        docLower.includes("reg-19") ||
        docLower.includes("cmp-05")
      ) {
        return "Renewals";
      }

      // Default to category-based folder for India
      return categoryMap[category] || "Compliance Documents";
    } else {
      // For other countries, use generic category-based mapping
      // Map compliance categories to folder names
      const genericCategoryMap: Record<string, string> = {
        VAT: "VAT Returns",
        "Corporate Tax": "Corporate Tax Returns",
        "Income Tax": "Income Tax Returns",
        Payroll: "Payroll Compliance",
        "Trade License Renewal": "License Renewals",
        "Commercial Registration Renewal": "License Renewals",
        "Federal Tax": "Federal Tax Returns",
        "State Tax": "State Tax Returns",
        "Business License": "License Renewals",
        Others: "Other Compliance Documents",
      };

      // Try to match category first
      if (genericCategoryMap[category]) {
        return genericCategoryMap[category];
      }

      // Fallback: check for common patterns across countries
      const docLower = documentName.toLowerCase();
      if (docLower.includes("vat") || docLower.includes("value added tax")) {
        return "VAT Returns";
      }
      if (docLower.includes("tax return") || docLower.includes("tax filing")) {
        return "Tax Returns";
      }
      if (docLower.includes("license") || docLower.includes("registration")) {
        return "License Renewals";
      }
      if (docLower.includes("payroll") || docLower.includes("salary")) {
        return "Payroll Compliance";
      }

      // Default fallback
      return "Compliance Documents";
    }
  };

  // Calculate period metadata for document upload
  const calculatePeriodMetadata = (req: any) => {
    const complianceType = req.compliance_type || "one-time";
    const dueDate = new Date(req.dueDate);
    const financialYear = req.financial_year || null;

    let periodType: "one-time" | "monthly" | "quarterly" | "annual" =
      "one-time";
    let periodKey = "";
    let periodStart = "";
    let periodEnd = "";
    let periodFinancialYear = financialYear;

    if (complianceType === "monthly") {
      periodType = "monthly";
      const month = dueDate.getMonth() + 1;
      const year = dueDate.getFullYear();
      periodKey = `${year}-${String(month).padStart(2, "0")}`;
      periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    } else if (complianceType === "quarterly") {
      periodType = "quarterly";
      const month = dueDate.getMonth() + 1;
      const year = dueDate.getFullYear();
      let quarter = 1;
      if (month >= 4 && month <= 6) quarter = 1;
      else if (month >= 7 && month <= 9) quarter = 2;
      else if (month >= 10 && month <= 12) quarter = 3;
      else quarter = 4;
      periodKey = `Q${quarter}-${year}`;
      const quarterStartMonth = (quarter - 1) * 3 + 1;
      periodStart = `${year}-${String(quarterStartMonth).padStart(2, "0")}-01`;
      const quarterEndMonth = quarter * 3;
      const lastDay = new Date(year, quarterEndMonth, 0).getDate();
      periodEnd = `${year}-${String(quarterEndMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    } else if (complianceType === "annual") {
      // Annual compliance: recurs every year
      periodType = "annual";
      const year = dueDate.getFullYear();
      periodKey = `FY-${year}`;
      periodStart = `${year}-04-01`;
      periodEnd = `${year + 1}-03-31`;
      periodFinancialYear = `FY ${year}-${String(year + 1).slice(-2)}`;
    } else if (complianceType === "one-time") {
      // One-time compliance: happens once, no recurring
      periodType = "one-time";
      const year = dueDate.getFullYear();
      periodKey = `one-time-${year}`;
      const normalizedDate = normalizeDate(dueDate);
      if (normalizedDate) {
        periodStart = formatDateForStorage(normalizedDate) || "";
        periodEnd = formatDateForStorage(normalizedDate) || "";
      } else {
        periodStart = `${year}-01-01`;
        periodEnd = `${year}-12-31`;
      }
      periodFinancialYear = null; // One-time items don't have a recurring financial year
    }

    return {
      periodType,
      periodKey,
      periodStart,
      periodEnd,
      periodFinancialYear,
    };
  };

  // Handle document upload from tracker
  const handleTrackerDocumentUpload = async () => {
    if (!documentUploadModal || !uploadFile || !currentCompany) return;

    setUploadingDocument(true);
    setUploadProgress(0);
    setUploadStage("Uploading file...");

    try {
      // Remove unused supabase client - we use server actions now

      // Upload file to storage via server action (works for both Supabase and Passport users)
      const fileExt = uploadFile.name.split(".").pop();
      const safeName = documentUploadModal.documentName
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 80);
      const fileName = `${documentUploadModal.requirementId}-${safeName}-${Date.now()}.${fileExt}`;
      const filePath = `${currentCompany.id}/compliance/${fileName}`;

      const fileArrayBuffer = await uploadFile.arrayBuffer();
      const uploadResult = await uploadFileToStorage(filePath, fileArrayBuffer, uploadFile.type);

      if (!uploadResult.success) {
        throw new Error(`Upload failed: ${uploadResult.error || 'Unknown error'}`);
      }

      // Get the requirement to calculate period metadata
      const requirement = (regulatoryRequirements || []).find(
        (r) => r.id === documentUploadModal.requirementId,
      );
      if (!requirement) throw new Error("Requirement not found");

      const periodMeta = calculatePeriodMetadata({
        compliance_type: requirement.compliance_type,
        dueDate: requirement.due_date,
        financial_year: requirement.financial_year,
      });

      // Determine folder name
      const folderName = getFolderForDocument(
        documentUploadModal.documentName,
        documentUploadModal.category,
      );

      // Save document metadata
      try {
        const uploadResult = await uploadDocument(currentCompany.id, {
          folderName,
          documentName: documentUploadModal.documentName,
          registrationDate: undefined,
          expiryDate: undefined,
          isPortalRequired: false,
          // Map compliance_type to frequency:
          // - 'one-time': no recurring, happens once (use 'one-time' or null)
          // - 'annual': recurs annually (use 'annually')
          // - 'monthly': recurs monthly (use 'monthly')
          // - 'quarterly': recurs quarterly (use 'quarterly')
          frequency:
            documentUploadModal.complianceType === "one-time"
              ? "one-time"
              : documentUploadModal.complianceType === "annual"
                ? "annually"
                : documentUploadModal.complianceType === "monthly"
                  ? "monthly"
                  : documentUploadModal.complianceType === "quarterly"
                    ? "quarterly"
                    : "one-time",
          filePath,
          fileName: uploadFile.name,
          periodType: periodMeta.periodType,
          periodFinancialYear: periodMeta.periodFinancialYear || null,
          periodKey: periodMeta.periodKey,
          periodStart: periodMeta.periodStart,
          periodEnd: periodMeta.periodEnd,
          requirementId: documentUploadModal.requirementId,
        });

        if (!uploadResult.success) {
          throw new Error("Failed to save document metadata");
        }

        // Track document upload
        if (user?.id && currentCompany?.id) {
          await trackDocumentUpload(
            user.id,
            currentCompany.id,
            documentUploadModal.documentName,
          ).catch((err) => {
            console.error("Failed to track document upload:", err);
          });
        }
      } catch (uploadError: any) {
        throw new Error(uploadError.message || "Failed to upload document");
      }

      setUploadStage("Verifying upload...");
      setUploadProgress(90);

      // Check if all required documents are uploaded
      const allDocs = documentUploadModal.allRequiredDocs;
      const uploadedDocs = await getCompanyDocuments(currentCompany.id);
      if (!uploadedDocs.success)
        throw new Error("Failed to check uploaded documents");

      // Filter documents for this requirement by period_key and document_type
      // Improved matching: exact match preferred, then normalized comparison
      const normalizeDocName = (name: string): string => {
        return name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "") // Remove special chars
          .replace(/\s+/g, "") // Remove spaces
          .trim();
      };

      const requirementDocs = (uploadedDocs.documents || []).filter(
        (doc: any) => {
          // Must match period
          if (doc.period_key !== periodMeta.periodKey) return false;

          // Check for document match with improved logic
          const docTypeNormalized = normalizeDocName(doc.document_type || "");
          return allDocs.some((reqDoc) => {
            const reqDocNormalized = normalizeDocName(reqDoc);
            // Exact normalized match (preferred)
            if (docTypeNormalized === reqDocNormalized) return true;
            // Check if one contains the other (but require at least 3 chars to avoid false positives)
            if (docTypeNormalized.length >= 3 && reqDocNormalized.length >= 3) {
              if (
                docTypeNormalized.includes(reqDocNormalized) ||
                reqDocNormalized.includes(docTypeNormalized)
              ) {
                // Additional validation: ensure it's not a substring match that's too short
                const minLength = Math.min(
                  docTypeNormalized.length,
                  reqDocNormalized.length,
                );
                if (minLength >= 5) return true; // Only allow substring match if at least 5 chars
              }
            }
            return false;
          });
        },
      );

      const uploadedDocNames = requirementDocs.map((doc: any) =>
        normalizeDocName(doc.document_type || ""),
      );
      const allRequiredUploaded = allDocs.every((doc: string) => {
        const reqDocNormalized = normalizeDocName(doc);
        return uploadedDocNames.some((uploaded: string) => {
          // Exact match
          if (uploaded === reqDocNormalized) return true;
          // Substring match with minimum length requirement
          if (uploaded.length >= 5 && reqDocNormalized.length >= 5) {
            return (
              uploaded.includes(reqDocNormalized) ||
              reqDocNormalized.includes(uploaded)
            );
          }
          return false;
        });
      });

      setUploadStage("Updating requirement status...");
      setUploadProgress(95);

      // Update requirement status
      let newStatus: "pending" | "completed" = "pending";
      if (allRequiredUploaded) {
        newStatus = "completed";
      } else if (requirementDocs.length > 0) {
        newStatus = "pending";
      }

      // Update requirement status
      const statusResult = await updateRequirementStatus(
        documentUploadModal.requirementId,
        currentCompany.id,
        newStatus,
      );

      if (!statusResult.success) {
        console.error("Failed to update status:", statusResult.error);
      }

      setUploadProgress(100);
      setUploadStage("Complete!");

      // Refresh requirements and vault documents
      const refreshResult = await getRegulatoryRequirements(currentCompany.id);
      if (refreshResult.success && refreshResult.requirements) {
        setRegulatoryRequirements(refreshResult.requirements);
      }

      const vaultResult = await getCompanyDocuments(currentCompany.id);
      if (vaultResult.success) {
        setVaultDocuments(vaultResult.documents || []);
      }

      // Show success message with more detail
      const successMessage = allRequiredUploaded
        ? `âœ… Document uploaded successfully! All required documents are now uploaded. Requirement status updated to "Completed".`
        : `âœ… Document uploaded successfully! ${allDocs.length - requirementDocs.length - 1} document(s) remaining. Requirement status updated to "Pending".`;

      showToast(successMessage, "success");

      // Keep modal open briefly to show success, then close
      setTimeout(() => {
        setDocumentUploadModal(null);
        setUploadFile(null);
        setUploadProgress(0);
        setUploadStage("");
        setPreviewFileUrl(null);
      }, 1500);
    } catch (error: any) {
      console.error("Error uploading document:", error);
      showToast(`âŒ Error uploading document: ${error.message}`, "error");
      setUploadProgress(0);
      setUploadStage("");
    } finally {
      setUploadingDocument(false);
    }
  };

  // Fetch upload history for requirement
  // Only fetch when modal opens (isOpen becomes true) or requirementId changes
  useEffect(() => {
    const fetchUploadHistory = async () => {
      // Only fetch if modal is actually open
      if (!documentUploadModal?.isOpen || !documentUploadModal?.requirementId || !currentCompany) {
        setRequirementUploadHistory([]);
        return;
      }

      try {
        const result = await getCompanyDocuments(currentCompany.id);
        if (result.success && result.documents) {
          // Filter documents for this requirement
          const history = result.documents
            .filter(
              (doc: any) =>
                doc.requirement_id === documentUploadModal.requirementId,
            )
            .sort((a: any, b: any) => {
              const dateA = new Date(a.created_at || 0).getTime();
              const dateB = new Date(b.created_at || 0).getTime();
              return dateB - dateA; // Newest first
            });
          setRequirementUploadHistory(history);
        }
      } catch (error) {
        console.error("Error fetching upload history:", error);
        setRequirementUploadHistory([]);
      }
    };

    // Only fetch if modal is open
    if (documentUploadModal?.isOpen) {
      fetchUploadHistory();
    }
  }, [
    documentUploadModal?.isOpen ?? false,
    documentUploadModal?.requirementId ?? null,
    currentCompany?.id ?? null
  ]);

  // Generate preview URL for file
  useEffect(() => {
    if (uploadFile) {
      const url = URL.createObjectURL(uploadFile);
      setPreviewFileUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setPreviewFileUrl(null);
    }
  }, [uploadFile]);

  // Mapped requirements for ReportsTab (no category filter — TrackerContext applies that)
  const displayRequirements = useMemo(() => {
    if (!regulatoryRequirements || regulatoryRequirements.length === 0) return [];
    const hasHiddenCompliances = hiddenCompliances.size > 0;
    return regulatoryRequirements
      .filter((req) => !(hasHiddenCompliances && hiddenCompliances.has(req.id)))
      .map((req) => ({
        id: req.id,
        template_id: (req as any).template_id ?? null,
        category: req.category,
        requirement: req.requirement,
        description: req.description || "",
        status: req.status,
        dueDate: formatDate(req.due_date),
        penalty: req.penalty || "",
        isCritical: req.is_critical,
        financial_year: req.financial_year,
        entity_type: (req as any).entity_type,
        industry: (req as any).industry,
        industry_category: (req as any).industry_category,
        compliance_type: (req as any).compliance_type,
        required_documents: req.required_documents || [],
        possible_legal_action: req.possible_legal_action,
        penalty_config: req.penalty_config,
        penalty_base_amount: req.penalty_base_amount,
        filed_on: req.filed_on,
        filed_by: req.filed_by,
        status_reason: req.status_reason,
      }));
  }, [regulatoryRequirements, hiddenCompliances, formatDate]);

  // Track render completion for tracker tab (must be after memoized values are defined)
  const prevActiveTab = useRef(activeTab);
  useEffect(() => {
    // Only log when switching TO tracker tab (not on every render)
    if (
      activeTab === "tracker" &&
      prevActiveTab.current !== "tracker" &&
      currentCompany?.id
    ) {
      const renderStartTime = performance.now();
      // Use requestAnimationFrame to measure after React has painted
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const renderDuration = performance.now() - renderStartTime;
          performanceLogger.log(
            "DataRoomPage",
            "tracker_tab_render_complete",
            renderDuration,
            {
              companyId: currentCompany.id,
              displayRequirementsCount: displayRequirements.length,
            },
          );
        });
      });
    }
    prevActiveTab.current = activeTab;
  }, [
    activeTab,
    currentCompany?.id,
    displayRequirements.length,
  ]);


  const [teamMembers] = useState([
    {
      id: "1",
      name: "Mohammed Ibrahim",
      email: "ibrahimshaheer75@gmail.com",
      joinedDate: "Jan 14, 2026",
      role: "ADMIN",
    },
    {
      id: "2",
      name: "MUNEER AHMED",
      email: "camuneer@muneerassociates.in",
      joinedDate: "Jan 16, 2026",
      role: "ADMIN",
    },
  ]);

  const roles = [
    { value: "viewer", label: "Viewer - Can view compliance items" },
    { value: "editor", label: "Editor - Can view and edit" },
    { value: "admin", label: "Admin - Full access including invites" },
  ];

  // --- Consolidated Rendering Logic ---
  
  // 1. Initial boot: Show dynamic loading messages
  if (isDataRoomInitLoading || (authLoading && !user)) {
    return (
      <div className="min-h-screen bg-primary-dark">
        <Header />
        <div className="container mx-auto px-4 py-8 space-y-6 max-w-7xl">
          {/* Skeleton company selector strip */}
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 w-36 animate-pulse rounded-xl bg-white/5 flex-shrink-0" />
            ))}
          </div>
          {/* Skeleton tab strip */}
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 w-24 animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
          {/* Skeleton main content */}
          <OverviewStatsSkeleton />
        </div>
      </div>
    );
  }

  // 2. Initialization Error
  if (initError) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-white text-xl font-medium mb-2">Failed to initialize</h2>
          <p className="text-gray-400 text-sm mb-6">{initError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-white text-black rounded-lg hover:bg-gray-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // 3. User authenticated but no access or no company (while redirecting)
  const isNoCompany = companies.length === 0;
  if ((isNoCompany || (currentCompany && !hasAccess && !accessLoading)) && !isDataRoomInitLoading) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="relative mb-6">
            <div className="w-12 h-12 border-4 border-white/30 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 bg-gradient-to-br from-blue-500/30 to-purple-500/30 rounded-full animate-pulse" />
            </div>
          </div>
          <h2 className="text-white text-lg font-semibold mb-2">
            {isNoCompany ? "Setting Up Your Workspace" : "Verifying Access"}
          </h2>
          <p className="text-gray-300 text-sm">
            {isNoCompany ? "Redirecting to company setup..." : "Checking subscription status..."}
          </p>
        </div>
      </div>
    );
  }

  // If owner without access, show redirect message (redirect happens via useEffect)
  if (currentCompany && isOwner && !hasAccess && !accessLoading) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="relative mb-6">
            <div className="w-12 h-12 border-4 border-white/30 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 bg-gradient-to-br from-blue-500/30 to-purple-500/30 rounded-full animate-pulse" />
            </div>
          </div>
          <h2 className="text-white text-lg font-semibold mb-2">Subscription Required</h2>
          <p className="text-gray-300 text-sm">Redirecting to subscription page...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      {/* Subtle Circuit Board Background */}
      <SubtleCircuitBackground />

      {/* Header */}
      <Header />

      {/* Trial Banner */}
      {accessType === "trial" &&
        trialDaysRemaining !== null &&
        currentCompany && (
          <div className="relative z-20 bg-gradient-to-r from-white/10 to-gray-600/20 border-b border-white/20">
            <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-gray-300">
                  <span className="text-white font-semibold">
                    {trialDaysRemaining} days
                  </span>{" "}
                  left in your trial
                </span>
              </div>
              <button
                onClick={() =>
                  router.push(`/subscribe?company_id=${currentCompany.id}`)
                }
                className="text-xs sm:text-sm bg-white text-black px-3 py-1 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Upgrade Now
              </button>
            </div>
          </div>
        )}

      {/* Main Content */}
      <div className="relative z-10 container mx-auto px-3 sm:px-4 py-4 sm:py-8 animate-fadeIn">
        {/* Company Selector */}
        <div className="mb-4 sm:mb-6">
          <h2 className="text-gray-400 text-sm font-medium mb-2 sm:mb-3">
            My companies
          </h2>
          <CompanySelector
            companies={companies}
            currentCompany={currentCompany}
            onCompanyChange={handleCompanyChange}
          />
        </div>

        {/* Page Title */}
        <h1 className="text-2xl sm:text-4xl font-light text-white mb-4 sm:mb-6">
          Data Room
        </h1>

        {/* Horizontal Tabs - Scrollable on Mobile */}
        <div className="flex items-center gap-2 mb-4 sm:mb-8 overflow-x-auto pb-2 -mx-3 sm:mx-0 px-3 sm:px-0 scrollbar-hide">
          <button
            onClick={() => {
              const startTime = performance.now();
              startTransition(() => {
                setActiveTab("overview");
                const duration = performance.now() - startTime;
                performanceLogger.log("DataRoomPage", "tab_switch", duration, {
                  fromTab: activeTab,
                  toTab: "overview",
                });
              });
            }}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === "overview"
                ? "border-white/40 bg-white/10 text-white"
                : "border-white/20 bg-black text-white hover:text-white hover:border-white/40"
            }`}
          >
            <svg
              width="16"
              height="16"
              className="sm:w-[18px] sm:h-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span className="text-sm sm:text-base">Overview</span>
          </button>
          <button
            onClick={() => {
              // Immediate UI update - no transition delay
              setActiveTab("tracker");
            }}
            onMouseEnter={() => {
              // Preload TrackerTab component on hover for faster switching
              if (activeTab !== "tracker") {
                import("./components/tracker/TrackerTab");
              }
            }}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === "tracker"
                ? "border-white/40 bg-white/10 text-white"
                : "border-white/20 bg-black text-white hover:text-white hover:border-white/40"
            }`}
          >
            <svg
              width="16"
              height="16"
              className="sm:w-[18px] sm:h-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="text-sm sm:text-base">Tracker</span>
          </button>
          <button
            onClick={() => startTransition(() => setActiveTab("documents"))}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === "documents"
                ? "border-white/40 bg-white/10 text-white"
                : "border-white/20 bg-black text-white hover:text-white hover:border-white/40"
            }`}
          >
            <svg
              width="16"
              height="16"
              className="sm:w-[18px] sm:h-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span className="text-sm sm:text-base">Documents</span>
          </button>
          <button
            onClick={() => startTransition(() => setActiveTab("reports"))}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === "reports"
                ? "border-white/40 bg-white/10 text-white"
                : "border-white/20 bg-black text-white hover:text-white hover:border-white/40"
            }`}
          >
            <svg
              width="16"
              height="16"
              className="sm:w-[18px] sm:h-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span className="text-sm sm:text-base">Reports</span>
          </button>
          <button
            onClick={() => startTransition(() => setActiveTab("dsc-din"))}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === "dsc-din"
                ? "border-white/40 bg-white/10 text-white"
                : "border-white/20 bg-black text-white hover:text-white hover:border-white/40"
            }`}
          >
            <svg
              width="16"
              height="16"
              className="sm:w-[18px] sm:h-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="text-sm sm:text-base">DSC & DIN</span>
          </button>
          <button
            onClick={() => startTransition(() => setActiveTab("notices"))}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === "notices"
                ? "border-white/40 bg-white/10 text-white"
                : "border-white/20 bg-black text-white hover:text-white hover:border-white/40"
            }`}
          >
            <svg
              width="16"
              height="16"
              className="sm:w-[18px] sm:h-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="text-sm sm:text-base">
              Notices <span className="text-gray-500 text-xs">(Soon)</span>
            </span>
          </button>
          {/* GST Tab - Only show for India */}
          {countryCode === "IN" && (
            <button
              onClick={() => startTransition(() => setActiveTab("gst"))}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                activeTab === "gst"
                  ? "border-white/40 bg-white/10 text-white"
                  : "border-white/20 bg-black text-white hover:text-white hover:border-white/40"
              }`}
            >
              <svg
                width="16"
                height="16"
                className="sm:w-[18px] sm:h-[18px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              <span className="text-sm sm:text-base">
                GST <span className="text-gray-500 text-xs">(Soon)</span>
              </span>
            </button>
          )}
        </div>

        {/* Content based on active tab */}
        {activeTab === "overview" && (
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-8">
                <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <OverviewTab
              isLoading={isLoading || isCompanySwitching}
              entityDetails={entityDetails}
              selectedDirectorId={selectedDirectorId}
              setSelectedDirectorId={setSelectedDirectorId}
              currentCompany={currentCompany}
              countryConfig={countryConfig}
              formatDateForDisplay={formatDateForDisplay}
            />
          </Suspense>
        )}

        {activeTab === "reports" && (
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-8">
                <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <ReportsTab
              displayRequirements={displayRequirements}
              currentCompany={currentCompany}
              countryCode={countryCode}
              countryConfig={countryConfig}
              user={user}
              calculateDelayMemoized={calculateDelayMemoized}
              calculatePenaltyMemoized={calculatePenaltyMemoized}
              normalizeDate={normalizeDate}
              formatDate={formatDate}
              isGeneratingEnhancedPDF={isGeneratingEnhancedPDF}
              setIsGeneratingEnhancedPDF={setIsGeneratingEnhancedPDF}
              pdfGenerationProgress={pdfGenerationProgress}
              setPdfGenerationProgress={setPdfGenerationProgress}
              isComplianceScoreModalOpen={isComplianceScoreModalOpen}
              setIsComplianceScoreModalOpen={setIsComplianceScoreModalOpen}
            />
          </Suspense>
        )}

        {/* Reports tab is now in ReportsTab component */}

        {activeTab === "notices" && (
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-8">
                <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <NoticesTab
              countryConfig={countryConfig}
              complianceCategories={complianceCategories}
              formatDateForDisplay={formatDateForDisplay}
            />
          </Suspense>
        )}

        {/* Compliance Details Modal */}
        {complianceDetailsModal &&
          (() => {
            const req = complianceDetailsModal;
            const formFreq = getFormFrequency(req.requirement);
            const legalSections = getRelevantLegalSections(
              req.requirement,
              req.category,
            );
            const authority = getAuthorityForCategory(req.category);

            // Get all relevant forms for this category (country-aware)
            const categoryForms =
              countryConfig?.regulatory?.commonForms?.filter((form) => {
                const formLower = form.toLowerCase();
                const categoryLower = req.category.toLowerCase();

                if (countryCode === "IN") {
                  // India-specific patterns
                  if (
                    categoryLower === "gst" &&
                    (formLower.includes("gstr") ||
                      formLower.includes("gst") ||
                      formLower.includes("cmp") ||
                      formLower.includes("itc") ||
                      formLower.includes("iff"))
                  )
                    return true;
                  if (
                    categoryLower === "income tax" &&
                    (formLower.includes("itr") ||
                      formLower.includes("form 24") ||
                      formLower.includes("form 26") ||
                      formLower.includes("form 27"))
                  )
                    return true;
                  if (
                    (categoryLower === "roc" || categoryLower === "mca") &&
                    (formLower.includes("mgt") ||
                      formLower.includes("aoc") ||
                      formLower.includes("dir") ||
                      formLower.includes("pas") ||
                      formLower.includes("ben") ||
                      formLower.includes("inc") ||
                      formLower.includes("adt") ||
                      formLower.includes("cra") ||
                      formLower.includes("llp"))
                  )
                    return true;
                  if (
                    (categoryLower === "payroll" ||
                      categoryLower === "labour law") &&
                    (formLower.includes("ecr") ||
                      formLower.includes("form 5a") ||
                      formLower.includes("form 2") ||
                      formLower.includes("form 10") ||
                      formLower.includes("form 19"))
                  )
                    return true;
                } else if (
                  ["AE", "SA", "OM", "QA", "BH"].includes(countryCode || "")
                ) {
                  // GCC countries
                  if (
                    (categoryLower === "vat" || categoryLower === "tax") &&
                    (formLower.includes("vat") ||
                      formLower.includes("tax return") ||
                      formLower.includes("corporate tax") ||
                      formLower.includes("zakat"))
                  )
                    return true;
                  if (
                    categoryLower === "corporate" &&
                    (formLower.includes("trade license") ||
                      formLower.includes("commercial registration") ||
                      formLower.includes("cr"))
                  )
                    return true;
                } else if (countryCode === "US") {
                  // USA
                  if (
                    (categoryLower === "federal tax" ||
                      categoryLower === "state tax") &&
                    (formLower.includes("tax") ||
                      formLower.includes("return") ||
                      formLower.includes("ein"))
                  )
                    return true;
                  if (
                    categoryLower === "business license" &&
                    (formLower.includes("license") ||
                      formLower.includes("registration") ||
                      formLower.includes("report"))
                  )
                    return true;
                }

                return false;
              }) || [];

            const formFrequency = countryConfig?.regulatory?.formFrequencies;

            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-black border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                  {/* Modal Header */}
                  <div className="sticky top-0 bg-black border-b border-white/10 p-6 flex items-center justify-between z-10">
                    <div>
                      <h2 className="text-2xl font-light text-white mb-1">
                        Compliance Details
                      </h2>
                      <p className="text-gray-400 text-sm">{req.requirement}</p>
                    </div>
                    <button
                      onClick={() => setComplianceDetailsModal(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-gray-400"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="p-6 space-y-6">
                    {/* Basic Information */}
                    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                      <h3 className="text-white font-medium mb-3">
                        Basic Information
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-start justify-between">
                          <span className="text-gray-400">Category:</span>
                          <span className="text-white font-medium">
                            {req.category}
                          </span>
                        </div>
                        {req.description && (
                          <div className="flex items-start justify-between">
                            <span className="text-gray-400">Description:</span>
                            <span className="text-white text-right max-w-[70%]">
                              {req.description}
                            </span>
                          </div>
                        )}
                        <div className="flex items-start justify-between">
                          <span className="text-gray-400">Due Date:</span>
                          <span className="text-white">
                            {(req as any).due_date || (req as any).dueDate}
                          </span>
                        </div>
                        <div className="flex items-start justify-between">
                          <span className="text-gray-400">Status:</span>
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              req.status === "completed"
                                ? "bg-green-500/20 text-green-400"
                                : req.status === "overdue"
                                  ? "bg-red-500/20 text-red-400"
                                  : req.status === "pending"
                                    ? "bg-yellow-500/20 text-yellow-400"
                                    : "bg-gray-500/20 text-gray-400"
                            }`}
                          >
                            {req.status.toUpperCase()}
                          </span>
                        </div>
                        {formFreq && (
                          <div className="flex items-start justify-between">
                            <span className="text-gray-400">
                              Filing Frequency:
                            </span>
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                formFreq === "monthly"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : formFreq === "quarterly"
                                    ? "bg-purple-500/20 text-purple-400"
                                    : formFreq === "annual"
                                      ? "bg-green-500/20 text-green-400"
                                      : "bg-gray-500/20 text-gray-400"
                              }`}
                            >
                              {formFreq.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Regulatory Authority */}
                    {authority && (
                      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                        <h3 className="text-white font-medium mb-3">
                          Regulatory Authority
                        </h3>
                        <p className="text-gray-300 text-sm">{authority}</p>
                      </div>
                    )}

                    {/* Legal Sections */}
                    {legalSections.length > 0 && (
                      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                        <h3 className="text-white font-medium mb-3">
                          Legal References
                        </h3>
                        <div className="space-y-3">
                          {legalSections.map((section, idx) => (
                            <div
                              key={idx}
                              className="border-l-2 border-blue-500/50 pl-3"
                            >
                              <div className="text-white font-medium text-sm">
                                {section.act} - {section.section}
                              </div>
                              <div className="text-gray-400 text-xs mt-1">
                                {section.description}
                              </div>
                              {section.relevance && (
                                <div className="text-gray-500 text-xs mt-1 italic">
                                  Relevance: {section.relevance}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Relevant Forms */}
                    {categoryForms.length > 0 && (
                      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                        <h3 className="text-white font-medium mb-3">
                          Relevant Forms
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {categoryForms.map((form) => (
                            <div
                              key={form}
                              className="flex items-center justify-between p-2 bg-gray-800 rounded border border-gray-700"
                            >
                              <span className="text-white text-sm">{form}</span>
                              {formFrequency?.[form] && (
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                    formFrequency[form] === "monthly"
                                      ? "bg-blue-500/20 text-blue-400"
                                      : formFrequency[form] === "quarterly"
                                        ? "bg-purple-500/20 text-purple-400"
                                        : formFrequency[form] === "annual"
                                          ? "bg-green-500/20 text-green-400"
                                          : "bg-gray-500/20 text-gray-400"
                                  }`}
                                >
                                  {formFrequency[form].toUpperCase()}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Penalty Information */}
                    {req.penalty && (
                      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                        <h3 className="text-white font-medium mb-3">
                          Penalty Information
                        </h3>
                        <p className="text-gray-300 text-sm">{req.penalty}</p>
                        {(() => {
                          const dueDateStr =
                            req.due_date || (req as any).dueDate || "";
                          const daysDelayed = calculateDelayMemoized(
                            dueDateStr,
                            req.status,
                          );
                          const calculatedPenalty = calculatePenaltyMemoized(
                            req.penalty || "",
                            daysDelayed || 0,
                            req.penalty_base_amount || null,
                          );
                          if (
                            calculatedPenalty !== "-" &&
                            !calculatedPenalty.includes("Cannot calculate")
                          ) {
                            return (
                              <div className="mt-2 pt-2 border-t border-gray-700">
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400 text-sm">
                                    Calculated Penalty:
                                  </span>
                                  <span className="text-red-400 font-semibold">
                                    {calculatedPenalty}
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Modal Footer */}
                  <div className="sticky bottom-0 bg-black border-t border-white/10 p-6 flex items-center justify-end">
                    <button
                      onClick={() => setComplianceDetailsModal(null)}
                      className="px-6 py-2.5 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

        {activeTab === "gst" && countryCode === "IN" && (
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-8">
                <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <GSTTab
              currentCompany={currentCompany}
              formatCurrency={formatCurrency}
            />
          </Suspense>
        )}

        {activeTab === "tracker" && (
          <TrackerContextProvider
            regulatoryRequirements={regulatoryRequirements}
            setRegulatoryRequirements={setRegulatoryRequirements}
            isLoadingRequirements={isLoadingRequirements || isCompanySwitching || isDataRoomInitLoading}
            refreshRequirements={refreshRequirements}
            hiddenCompliances={hiddenCompliances}
            setHiddenCompliances={setHiddenCompliances}
            vaultDocuments={vaultDocuments}
            currentCompany={currentCompany}
            user={user}
            canEdit={canEdit}
            canManage={canManage}
            isComplianceScoreModalOpen={isComplianceScoreModalOpen}
            setIsComplianceScoreModalOpen={setIsComplianceScoreModalOpen}
            regulatoryService={regulatoryService}
            financialYears={financialYears}
            setComplianceDetailsModal={setComplianceDetailsModal}
            handleStatusChange={handleStatusChange}
            handleTrackerDocumentUpload={handleTrackerDocumentUpload}
            documentUploadModal={documentUploadModal}
            setDocumentUploadModal={setDocumentUploadModal}
            uploadingDocument={uploadingDocument}
            setUploadingDocument={setUploadingDocument}
            uploadFile={uploadFile}
            setUploadFile={setUploadFile}
            uploadProgress={uploadProgress}
            setUploadProgress={setUploadProgress}
            uploadStage={uploadStage}
            setUploadStage={setUploadStage}
            previewFileUrl={previewFileUrl}
            setPreviewFileUrl={setPreviewFileUrl}
            countryCode={countryCode}
            countryConfig={countryConfig}
            complianceCategories={complianceCategories}
            entityDetails={entityDetails}
            calculateDelayMemoized={calculateDelayMemoized}
            calculatePenaltyMemoized={calculatePenaltyMemoized}
            normalizeDate={normalizeDate}
            formatDate={formatDate}
            getFormFrequency={getFormFrequency}
            getRelevantLegalSections={getRelevantLegalSections}
            getAuthorityForCategory={getAuthorityForCategory}
          >
            <Suspense
              fallback={
                <div className="flex items-center justify-center p-8">
                  <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                </div>
              }
            >
              <TrackerTab />
            </Suspense>
          </TrackerContextProvider>
        )}

        {activeTab === "dsc-din" && (
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-8">
                <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <DscDinTab entityDetails={entityDetails} />
          </Suspense>
        )}

        {activeTab === "documents" && (
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-8">
                <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <DocumentsTab
              vaultDocuments={vaultDocuments}
              setVaultDocuments={setVaultDocuments}
              isLoadingVaultDocuments={isLoadingVaultDocuments || isCompanySwitching}
              setIsLoadingVaultDocuments={setIsLoadingVaultDocuments}
              documentTemplates={documentTemplates}
              setDocumentTemplates={setDocumentTemplates}
              hiddenTemplates={hiddenTemplates}
              setHiddenTemplates={setHiddenTemplates}
              documentFolders={documentFolders}
              predefinedDocuments={predefinedDocuments}
              fetchVaultDocuments={fetchVaultDocuments}
              currentCompany={currentCompany}
              canEdit={canEdit}
              canManage={canManage}
              user={user}
              financialYears={financialYears}
              countryCode={countryCode}
              countryConfig={countryConfig}
              normalizeDate={normalizeDate}
              formatDateForDisplay={formatDateForDisplay}
              formatDateForStorage={formatDateForStorage}
              getFormFrequency={getFormFrequency}
              getRelevantLegalSections={getRelevantLegalSections}
              getAuthorityForCategory={getAuthorityForCategory}
              showToast={showToast}
            />
          </Suspense>
        )}
      </div>

      {/* Document Upload Modal from Tracker - Rendered at parent level so it's always available */}
      {documentUploadModal && documentUploadModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-light text-white">Upload Document</h3>
                  <p className="text-sm text-gray-400 mt-1">Upload document for compliance requirement</p>
                </div>
                <button
                  onClick={() => {
                    if (!uploadingDocument) {
                      setDocumentUploadModal(null);
                      setUploadFile(null);
                      setUploadProgress(0);
                      setUploadStage("");
                      setPreviewFileUrl(null);
                    }
                  }}
                  disabled={uploadingDocument}
                  className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Requirement Info */}
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Requirement</label>
                    <div className="text-white font-medium">{documentUploadModal.requirement}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Document Type</label>
                    <div className="text-blue-400 font-medium">{documentUploadModal.documentName}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
                    <div className="text-gray-300 text-sm">{documentUploadModal.category}</div>
                  </div>
                </div>
              </div>

              {/* File Upload Area */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Select File</label>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 transition-colors ${uploadFile
                      ? 'border-green-500/50 bg-green-500/10'
                      : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
                    }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      setUploadFile(file);
                    }
                  }}
                >
                  {!uploadFile ? (
                    <div className="text-center">
                      <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-gray-400 text-sm mb-2">Drag and drop a file here, or click to browse</p>
                      <p className="text-gray-500 text-xs">Supports: PDF, Images (JPG, PNG), Word (DOC, DOCX)</p>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setUploadFile(file);
                          }
                        }}
                        className="hidden"
                        id="tracker-file-upload-input"
                      />
                      <label
                        htmlFor="tracker-file-upload-input"
                        className="mt-3 inline-block px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors cursor-pointer text-sm font-medium"
                      >
                        Browse Files
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="min-w-0 flex-1">
                              <p className="text-white font-medium truncate">{uploadFile.name}</p>
                              <p className="text-gray-400 text-xs mt-0.5">
                                {(uploadFile.size / 1024 / 1024).toFixed(2)} MB • {uploadFile.type || 'Unknown type'}
                              </p>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setUploadFile(null)}
                          disabled={uploadingDocument}
                          className="text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50 ml-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Upload Progress */}
              {uploadingDocument && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{uploadStage || 'Uploading...'}</span>
                    <span className="text-white font-medium">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-white h-full rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 border-t border-gray-800 flex justify-end gap-3">
                <button
                  onClick={() => {
                    if (!uploadingDocument) {
                      setDocumentUploadModal(null);
                      setUploadFile(null);
                      setUploadProgress(0);
                      setUploadStage("");
                      setPreviewFileUrl(null);
                    }
                  }}
                  disabled={uploadingDocument}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (handleTrackerDocumentUpload) {
                      handleTrackerDocumentUpload().catch((err) => {
                        console.error('Upload error:', err);
                        showToast(`Error uploading document: ${err.message || 'Unknown error'}`, 'error');
                      });
                    } else {
                      console.error('handleTrackerDocumentUpload is not available');
                      showToast('Upload handler is not available', 'error');
                    }
                  }}
                  disabled={!uploadFile || uploadingDocument || !handleTrackerDocumentUpload}
                  className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                >
                  {uploadingDocument ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      {uploadStage || 'Uploading...'}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Upload Document
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />

    </div>
  );
}

export default function DataRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <DataRoomProvider>
        <DataRoomPageInner />
      </DataRoomProvider>
    </Suspense>
  );
}
