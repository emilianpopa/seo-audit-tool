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
   * Always targets the draft version ("drafts.<docId>") so the published
   * document is untouched until the user reviews and publishes in Studio.
   */
  async patchDocument(docId, setFields) {
    // Normalise to the draft ID so we never overwrite a live published doc
    const draftId = docId.startsWith('drafts.') ? docId : `drafts.${docId}`;
    const result = await this.client
      .patch(draftId)
      .set(setFields)
      .commit({ autoGenerateArrayKeys: true });
    return result;
  }

  /**
   * Apply a field change directly to the published document AND publish it live.
   * Skips the draft — the change is immediately visible on the live site.
   * Use only for unambiguous fixes (canonical URL, meta tags, etc.).
   */
  async publishDocument(docId, setFields) {
    // Strip drafts. prefix — we write directly to the published document
    const publishedId = docId.replace(/^drafts\./, '');
    const result = await this.client
      .patch(publishedId)
      .set(setFields)
      .commit({ autoGenerateArrayKeys: true });
    return result;
  }

  /**
   * Append items to an array field in a draft document.
   * Uses setIfMissing to initialise the array if it doesn't exist yet.
   */
  async appendToArray(docId, fieldPath, items) {
    const draftId = docId.startsWith('drafts.') ? docId : `drafts.${docId}`;
    const result = await this.client
      .patch(draftId)
      .setIfMissing({ [fieldPath]: [] })
      .insert('after', `${fieldPath}[-1]`, items)
      .commit({ autoGenerateArrayKeys: true });
    return result;
  }

  /**
   * Append items to an array field on the published document directly (no draft).
   */
  async publishAppendToArray(docId, fieldPath, items) {
    const publishedId = docId.replace(/^drafts\./, '');
    const result = await this.client
      .patch(publishedId)
      .setIfMissing({ [fieldPath]: [] })
      .insert('after', `${fieldPath}[-1]`, items)
      .commit({ autoGenerateArrayKeys: true });
    return result;
  }

  /**
   * Find or create a pageSeo document for a given page path slug.
   * Returns the document _id (without drafts. prefix).
   */
  async getOrCreatePageSeoDoc(slug) {
    // Normalise slug: ensure it starts with /
    const normSlug = slug.startsWith('/') ? slug : '/' + slug;
    const existing = await this.client.fetch(
      '*[_type == "pageSeo" && slug == $slug][0]',
      { slug: normSlug }
    );
    if (existing) return existing._id.replace(/^drafts\./, '');

    // Create a new minimal pageSeo doc
    const created = await this.client.create({
      _type: 'pageSeo',
      slug: normSlug,
    });
    return created._id;
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
