/**
 * Razorpay Payment Utilities (Client-side)
 */

declare global {
  interface Window {
    Razorpay: any
  }
}

export interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  handler: (response: RazorpayResponse) => void
  prefill?: {
    email?: string
    contact?: string
    name?: string
  }
  theme?: {
    color: string
  }
  modal?: {
    ondismiss?: () => void
  }
}

export interface RazorpayResponse {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

export async function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Razorpay script can only be loaded in browser'))
      return
    }

    if (window.Razorpay) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Razorpay script'))
    document.body.appendChild(script)
  })
}

export async function createRazorpayOrder(
  tier: string,
  billingCycle: string,
  companyId?: string
): Promise<{ orderId: string; amount: number; currency: string; keyId: string }> {
  const response = await fetch('/api/payments/create-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tier,
      billingCycle,
      companyId,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create order')
  }

  return response.json()
}

export async function verifyPayment(
  razorpay_order_id: string,
  razorpay_payment_id: string,
  razorpay_signature: string
): Promise<{ success: boolean; message: string }> {
  const response = await fetch('/api/payments/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to verify payment')
  }

  return response.json()
}

export function openRazorpayCheckout(options: RazorpayOptions): void {
  if (typeof window === 'undefined' || !window.Razorpay) {
    throw new Error('Razorpay script not loaded')
  }

  const razorpay = new window.Razorpay(options)
  razorpay.open()
}
