/**
 * Razorpay Client Instance
 * Server-side only
 */

import Razorpay from 'razorpay'
import { RAZORPAY_CONFIG } from './config'

let razorpayInstance: Razorpay | null = null

export function getRazorpayInstance(): Razorpay {
  if (typeof window !== 'undefined') {
    throw new Error('Razorpay instance can only be created on the server side')
  }

  if (!razorpayInstance) {
    if (!RAZORPAY_CONFIG.keyId || !RAZORPAY_CONFIG.keySecret) {
      throw new Error('Razorpay credentials not configured. Please set NEXT_PUBLIC_RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET')
    }

    razorpayInstance = new Razorpay({
      key_id: RAZORPAY_CONFIG.keyId,
      key_secret: RAZORPAY_CONFIG.keySecret,
    })
  }

  return razorpayInstance
}
