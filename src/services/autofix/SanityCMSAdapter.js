import { createClient } from '@sanity/client';

/**
 * Adapter for Sanity CMS — wraps @sanity/client with helpers for the AutoFix engine.
 * Patching a published document via write token creates a draft automatically.
 * The published document stays unchanged until the user publishes the draft in Studio.
 */
export class SanityCMSAdapter {
  constructor({ projectId, dataset = 'production', token }) {
    if (!token) throw new Error('Sanity API token is required');
    this.client = createClient({
      projectId,
      dataset,
      token,
      apiVersion: '2024-01-01',
      useCdn: false,
    });
    this.projectId = projectId;
    this.dataset = dataset;
  }

  /** Fetch all documents of a given type */
  async getDocumentsByType(type) {
    return this.client.fetch('*[_type == $type]', { type });
  }

  /** Fetch a single document by ID */
  async getDocument(id) {
    return this.client.getDocument(id);
  }

  /** Run a raw GROQ query */
  async query(groq, params = {}) {
    return this.client.fetch(groq, params);
  }

  /**
   * Patch a document with a set of field changes.
   * Creates a draft ("drafts.<docId>") — original published doc is untouched.
   */
  async patchDocument(docId, setFields) {
    const result = await this.client
      .patch(docId)
      .set(setFields)
      .commit({ autoGenerateArrayKeys: true });
    return result;
  }

  /**
   * Get the current value of a nested field from a document.
   * e.g. getFieldValue(doc, 'heroSection.image.alt')
   */
  static getFieldValue(doc, fieldPath) {
    if (!doc) return null;
    return fieldPath.split('.').reduce((acc, key) => acc?.[key], doc);
  }

  /**
   * Build a nested set object for patching.
   * e.g. buildSetObject('heroSection.image.alt', 'New alt text')
   *   → { heroSection: { image: { alt: 'New alt text' } } }
   */
  static buildSetObject(fieldPath, value) {
    const keys = fieldPath.split('.');
    const result = {};
    let current = result;
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    return result;
  }
}
