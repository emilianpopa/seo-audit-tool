import prisma from '../../config/database.js';

/**
 * Look up the CMS configuration for a given domain.
 * Returns the CMSConfig record, or null if none is registered for that domain.
 *
 * @param {string} domain  e.g. "expandhealth.io" or "healthspan.co.za"
 * @returns {Promise<import('@prisma/client').CMSConfig | null>}
 */
export async function getCMSConfigForDomain(domain) {
  if (!domain) return null;
  return prisma.cMSConfig.findUnique({ where: { domain } });
}
