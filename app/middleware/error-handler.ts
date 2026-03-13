// Error handling middleware and utilities

import { NextResponse } from "next/server"

// Type definitions for context parameter
export interface RequestContext {
  params?: Record<string, string>
  [key: string]: unknown
}

// Prisma error interface (simplified)
interface PrismaError extends Error {
  code?: string
  meta?: Record<string, unknown>
}

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown
  ) {
    super(message)
    this.name = "AppError"
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details)
    this.name = "ValidationError"
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "AUTHENTICATION_ERROR")
    this.name = "AuthenticationError"
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, 403, "AUTHORIZATION_ERROR")
    this.name = "AuthorizationError"
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND_ERROR")
    this.name = "NotFoundError"
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Resource already exists") {
    super(message, 409, "CONFLICT_ERROR")
    this.name = "ConflictError"
  }
}

// Error handler for API routes
export function withErrorHandler<T = unknown>(
  handler: (req: Request, context?: RequestContext) => Promise<NextResponse<T>>
) {
  return async (req: Request, context?: RequestContext): Promise<NextResponse> => {
    try {
      const response = await handler(req, context)
      return response
    } catch (error: unknown) {
      console.error("[ErrorHandler] Unhandled error:", error)
      
      if (error instanceof AppError) {
        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
            details: error.details,
            timestamp: new Date().toISOString()
          },
          { status: error.statusCode }
        )
      }

      // Handle Prisma errors
      if (error && typeof error === 'object' && 'code' in error) {
        const prismaError = error as PrismaError
        if (prismaError.code === 'P2002') {
          return NextResponse.json(
            {
              error: "Resource already exists",
              code: "DUPLICATE_ENTRY",
              timestamp: new Date().toISOString()
            },
            { status: 409 }
          )
        }
      }

      // Default error response
      return NextResponse.json(
        {
          error: "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      )
    }
  }
}

// Validation utilities
export function validateRequired(value: unknown, fieldName: string): void {
  if (value === undefined || value === null || value === "") {
    throw new ValidationError(`${fieldName} is required`)
  }
}

export function validateEmail(email: string): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw new ValidationError("Invalid email format")
  }
}

export function validateMinLength(value: string, minLength: number, fieldName: string): void {
  if (value.length < minLength) {
    throw new ValidationError(`${fieldName} must be at least ${minLength} characters`)
  }
}

// API response utilities
export function successResponse<T = unknown>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data,
      timestamp: new Date().toISOString()
    },
    { status }
  )
}

export function errorResponse(error: AppError | string, status?: number): NextResponse {
  if (typeof error === 'string') {
    return NextResponse.json(
      {
        success: false,
        error,
        timestamp: new Date().toISOString()
      },
      { status: status || 500 }
    )
  }
  
  return NextResponse.json(
    {
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
      timestamp: new Date().toISOString()
    },
    { status: error.statusCode }
  )
}
