/**
 * Standardized API response formatter
 * Ensures consistent response structure across all endpoints
 */

/**
 * Success response
 * @param {*} data - Response data
 * @param {string} message - Optional success message
 * @returns {Object} Formatted success response
 */
export function successResponse(data, message = null) {
  return {
    success: true,
    ...(message && { message }),
    data
  };
}

/**
 * Error response
 * @param {string} message - Error message
 * @param {string} code - Error code (optional)
 * @param {*} details - Additional error details (optional)
 * @returns {Object} Formatted error response
 */
export function errorResponse(message, code = 'ERROR', details = null) {
  return {
    success: false,
    error: {
      message,
      code,
      ...(details && { details })
    }
  };
}

/**
 * Paginated response
 * @param {Array} data - Array of items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 * @returns {Object} Formatted paginated response
 */
export function paginatedResponse(data, page, limit, total) {
  const totalPages = Math.ceil(total / limit);
  const hasMore = page < totalPages;

  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore
    }
  };
}

/**
 * Validation error response
 * @param {Array} errors - Array of validation errors
 * @returns {Object} Formatted validation error response
 */
export function validationErrorResponse(errors) {
  return {
    success: false,
    error: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors
    }
  };
}

/**
 * Not found response
 * @param {string} resource - Resource name (e.g., 'Audit', 'User')
 * @param {string} identifier - Resource identifier (optional)
 * @returns {Object} Formatted not found response
 */
export function notFoundResponse(resource, identifier = null) {
  const message = identifier
    ? `${resource} with identifier '${identifier}' not found`
    : `${resource} not found`;

  return {
    success: false,
    error: {
      message,
      code: 'NOT_FOUND'
    }
  };
}

/**
 * Unauthorized response
 * @param {string} message - Optional custom message
 * @returns {Object} Formatted unauthorized response
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return {
    success: false,
    error: {
      message,
      code: 'UNAUTHORIZED'
    }
  };
}

/**
 * Forbidden response
 * @param {string} message - Optional custom message
 * @returns {Object} Formatted forbidden response
 */
export function forbiddenResponse(message = 'Forbidden') {
  return {
    success: false,
    error: {
      message,
      code: 'FORBIDDEN'
    }
  };
}

/**
 * Rate limit exceeded response
 * @param {number} retryAfter - Seconds until rate limit resets
 * @returns {Object} Formatted rate limit response
 */
export function rateLimitResponse(retryAfter = 60) {
  return {
    success: false,
    error: {
      message: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter
    }
  };
}

/**
 * HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};
