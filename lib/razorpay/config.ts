/**
 * Razorpay Configuration
 */

export const RAZORPAY_CONFIG = {
  // These will be set from environment variables
  keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || '',
}

if (!RAZORPAY_CONFIG.keyId && typeof window === 'undefined') {
  console.warn('Razorpay Key ID not configured. Set NEXT_PUBLIC_RAZORPAY_KEY_ID in .env.local')
}

if (!RAZORPAY_CONFIG.keySecret && typeof window === 'undefined') {
  console.warn('Razorpay Key Secret not configured. Set RAZORPAY_KEY_SECRET in .env.local')
}
