'use server'

import { prisma } from '@/lib/prisma'
import { handleActionError } from '@/lib/errors/handle-error'
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

    // Insert contact submission using Prisma
    const submission = await (prisma as any).contactSubmission.create({
      data: {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        company: formData.company?.trim() || null,
        phone: formData.phone?.trim() || null,
        message: formData.message.trim(),
        status: 'new',
      },
    })

    if (!submission) {
      throw new Error('Failed to create contact submission')
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
  } catch (error) {
    return handleActionError(error)
  }
}
