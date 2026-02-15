'use server'

import { createClient } from '@/utils/supabase/server'
import { Resend } from 'resend'

// Initialize Resend only if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export interface ContactFormData {
  name: string
  email: string
  company?: string
  phone?: string
  message: string
}

export interface ContactSubmissionResult {
  success: boolean
  error?: string
  id?: string
}

export async function submitContactForm(
  formData: ContactFormData
): Promise<ContactSubmissionResult> {
  try {
    // Validate required fields
    if (!formData.name || !formData.email || !formData.message) {
      return {
        success: false,
        error: 'Name, email, and message are required fields.',
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      return {
        success: false,
        error: 'Please provide a valid email address.',
      }
    }

    // Create Supabase client (no auth required for inserts due to RLS policy)
    const supabase = await createClient()

    // Insert contact submission
    // Note: We don't use .select() after insert to avoid RLS SELECT policy issues
    const { data, error } = await supabase
      .from('contact_submissions')
      .insert({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        company: formData.company?.trim() || null,
        phone: formData.phone?.trim() || null,
        message: formData.message.trim(),
        status: 'new',
      })

    if (error) {
      console.error('[Contact Form] Database error:', error)
      console.error('[Contact Form] Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
      
      // Provide more specific error messages
      if (error.code === '42P01') {
        return {
          success: false,
          error: 'Database table not found. Please ensure the migration has been run.',
        }
      } else if (error.code === '42501') {
        return {
          success: false,
          error: 'Permission denied. Please ensure Row Level Security policies allow anonymous inserts.',
        }
      } else if (error.message?.includes('RLS') || error.message?.includes('policy')) {
        return {
          success: false,
          error: 'Access denied. Please ensure the contact_submissions table RLS policies are configured correctly.',
        }
      }
      
      return {
        success: false,
        error: `Failed to submit your message: ${error.message || 'Unknown error'}. Please try again later.`,
      }
    }

    // Send email notification (optional - only if RESEND_API_KEY is configured)
    if (resend && process.env.RESEND_API_KEY) {
      try {
        await resend.emails.send({
          from: 'Finacra <noreply@finacra.com>', // Update with your verified domain
          to: ['info@finacra.com'], // Update with your contact email
          subject: `New Contact Form Submission from ${formData.name}`,
          html: `
            <h2>New Contact Form Submission</h2>
            <p><strong>Name:</strong> ${formData.name}</p>
            <p><strong>Email:</strong> ${formData.email}</p>
            ${formData.company ? `<p><strong>Company:</strong> ${formData.company}</p>` : ''}
            ${formData.phone ? `<p><strong>Phone:</strong> ${formData.phone}</p>` : ''}
            <p><strong>Message:</strong></p>
            <p>${formData.message.replace(/\n/g, '<br>')}</p>
            <hr>
            <p><small>Submitted at: ${new Date().toLocaleString()}</small></p>
          `,
        })
      } catch (emailError) {
        // Log email error but don't fail the submission
        console.error('[Contact Form] Email notification error:', emailError)
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    console.error('[Contact Form] Unexpected error:', error)
    return {
      success: false,
      error: 'An unexpected error occurred. Please try again later.',
    }
  }
}
