'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Company {
  id: string
  name: string
  type: string
  year: string
}

interface CompanySelectorProps {
  companies: Company[]
  currentCompany: Company | null
  onCompanyChange: (company: Company) => void
}

export default function CompanySelector({ companies, currentCompany, onCompanyChange }: CompanySelectorProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      {/* Current Company Display */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-4 bg-primary-dark-card border border-gray-800 rounded-lg sm:rounded-xl hover:border-primary-orange/50 transition-colors w-full"
      >
        <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary-orange rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-primary-orange/30 flex-shrink-0">
          <svg
            width="16"
            height="16"
            className="sm:w-6 sm:h-6"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M14 2V8H20"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-white text-base sm:text-2xl font-light break-words leading-tight">
            {currentCompany ? currentCompany.name : 'Select Company'}
          </div>
          <div className="text-gray-400 text-xs sm:text-sm mt-0.5 sm:mt-0">
            {currentCompany ? `${currentCompany.type} — ${currentCompany.year}` : 'No company selected'}
          </div>
        </div>
        <svg
          width="16"
          height="16"
          className={`sm:w-5 sm:h-5 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-2 w-full bg-gray-900 border border-gray-800 rounded-lg sm:rounded-xl shadow-2xl z-50 sm:min-w-[300px] opacity-100">
            <div className="p-3 sm:p-4 border-b border-gray-800">
              <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">
                SELECT COMPANY
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {companies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => {
                    onCompanyChange(company)
                    setIsOpen(false)
                  }}
                  className="w-full flex items-center gap-2 sm:gap-3 p-3 sm:p-4 hover:bg-gray-900 transition-colors text-left"
                >
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary-orange rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg
                      width="16"
                      height="16"
                      className="sm:w-5 sm:h-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M14 2V8H20"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium text-sm sm:text-base break-words">{company.name}</div>
                    <div className="text-gray-400 text-xs sm:text-sm">
                      {company.type} — {company.year}
                    </div>
                  </div>
                  {currentCompany && company.id === currentCompany.id && (
                    <div className="w-2 h-2 bg-primary-orange rounded-full flex-shrink-0"></div>
                  )}
                </button>
              ))}
              <button
                onClick={() => {
                  // Navigate to onboarding
                  router.push('/onboarding')
                }}
                className="w-full flex items-center gap-2 sm:gap-3 p-3 sm:p-4 hover:bg-gray-900 transition-colors text-left border-t border-gray-800"
              >
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary-orange/20 border border-primary-orange rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg
                    width="16"
                    height="16"
                    className="sm:w-5 sm:h-5 text-primary-orange"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <div className="text-primary-orange font-medium text-sm sm:text-base">Create New Company</div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
