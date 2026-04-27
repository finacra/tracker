/**
 * Curated loading-message pools for major skeleton states. Each pool
 * is shaped around what the user is actually waiting on at that point
 * in the flow — Indian-compliance-fintech specific so the wait feels
 * intentional and on-brand instead of generic.
 *
 * Keep messages:
 *   - Short (≤ 60 chars; many users on mobile)
 *   - Specific (mention a real thing — MCA, CIN, NIC, ITR, GST)
 *   - Active voice ("Pinging the registry…", not "The registry is being pinged")
 *   - Light on emoji (one per message at most)
 */

export const CREATE_COMPANY_LOADING_MESSAGES = [
  '🏛️ Pinging the MCA registry…',
  '🔍 Cross-referencing your CIN with the Ministry…',
  '📜 Decoding your NIC industry classification…',
  '🗂️ Drafting your compliance taxonomy…',
  '🔐 Setting up your encrypted document vault…',
  '⚙️ Computing trial period and subscription state…',
  '📅 Generating your first compliance calendar…',
  '🤖 Briefing the CIA agent about your new company…',
  '⚖️ Mapping applicable acts and sections…',
  '✨ Almost there — one last MCA handshake…',
] as const

export const DATA_ROOM_LOADING_MESSAGES = [
  '🛰️ Initiating secure handshake with compliance grid…',
  '🔐 Negotiating AES-256 vault keystream…',
  '🏛️ Synchronizing with the Ministry of Corporate Affairs…',
  '⚙️ Bootstrapping your enterprise compliance node…',
  '📡 Streaming jurisdictional ruleset for India…',
  '🧬 Indexing regulatory records across the Companies Act…',
  '⚖️ Calibrating risk vectors across financial year…',
  '🤖 Spinning up the CIA neural agent…',
  '📊 Locking in real-time compliance telemetry…',
  '🚀 Compliance command center coming online…',
] as const

/**
 * Shown briefly on /login after the user clicks "Continue with
 * Google". Sets the tone before the OAuth handshake redirects them
 * to Google's domain.
 */
export const SIGN_IN_LOADING_MESSAGES = [
  '🛰️ Establishing secure tunnel to Google identity service…',
  '🔐 Verifying your credentials with the auth fabric…',
  '🏛️ Cross-checking your access matrix…',
  '⚡ Provisioning your secure session…',
] as const

export const DOCUMENTS_VAULT_LOADING_MESSAGES = [
  '🔐 Decrypting vault contents…',
  '🗂️ Indexing folders by compliance category…',
  '📜 Loading your document storage manifest…',
  '🕰️ Resolving version history chains…',
  '📅 Sorting by financial year…',
  '✅ Cross-checking against required documents…',
] as const

export const COMPLIANCE_TRACKER_LOADING_MESSAGES = [
  '⚖️ Pulling regulatory requirements…',
  '📅 Computing due dates against your FY calendar…',
  '📜 Cross-checking with the Income Tax Act…',
  '⚠️ Tallying overdue penalties…',
  '📋 Loading your filing register…',
  '🚨 Sorting by criticality…',
  '🤖 Asking the CIA agent if anything looks off…',
] as const
