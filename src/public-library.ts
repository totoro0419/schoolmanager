import {getPublicPrintPreferences} from './db';
import {validateMetadata} from './schema';
import type {Metadata, RecordDoc} from './types';

interface CatalogEntry {
  path: string;
  sha256: string;
  pageCount: number;
  fileSize: number;
  meta: Metadata;
}

export interface PublicPrintPreferences {
  favorite?: boolean;
  lastOpenedAt?: string;
  classification?: {
    title: Metadata['title'];
    primarySubjectId: Metadata['primarySubjectId'];
    topicIds: Metadata['topicIds'];
    materialTypeId: Metadata['materialTypeId'];
    series: Metadata['series'];
    tags: Metadata['tags'];
    relations: Metadata['relations'];
    review: Metadata['review'];
    evidence: Metadata['evidence'];
    updatedAt: string;
  };
}

export async function loadPublicCatalog(signal: AbortSignal): Promise<RecordDoc[]> {
  const response = await fetch(import.meta.env.BASE_URL + 'library/catalog.json', {
    cache: 'no-cache', signal,
  });
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return parsePublicCatalog(await response.json());
}

export function parsePublicCatalog(input: unknown): RecordDoc[] {
  const catalog = input as {version?: unknown; documents?: unknown};
  if (catalog?.version !== 1 || !Array.isArray(catalog.documents)) throw Error('カタログの形式が不正です');
  const ids = new Set<string>();
  const hashes = new Set<string>();
  return catalog.documents.map((value: CatalogEntry) => {
    if (!value || !/^[a-f0-9]{64}$/.test(value.sha256) ||
        value.path !== `pdfs/${value.sha256}.pdf` ||
        !Number.isSafeInteger(value.pageCount) || value.pageCount < 1 ||
        !Number.isSafeInteger(value.fileSize) || value.fileSize < 1 || value.fileSize > 100 * 1024 * 1024) {
      throw Error('カタログ内のPDF情報が不正です');
    }
    const meta = validateMetadata(value.meta);
    if (ids.has(meta.documentId) || hashes.has(value.sha256) ||
        meta.pageMapping.length !== value.pageCount ||
        meta.pageMapping.some((page, index) => page.pdfPage !== index + 1)) {
      throw Error('カタログ内の教材ID・ハッシュ・ページ情報が不整合です');
    }
    ids.add(meta.documentId);
    hashes.add(value.sha256);
    return {
      id: meta.documentId, meta, pageCount: value.pageCount, fileSize: value.fileSize,
      fileHash: value.sha256, publicPdfUrl: import.meta.env.BASE_URL + 'library/' + value.path,
      searchText: meta.pageMapping.map(p => [p.text, p.ocrText].filter(Boolean).join(' ')).join(' '),
      favorite: false, lastOpenedAt: null, sync: 'synced', remoteRevision: null, revision: 0,
      deletedAt: null, warnings: [], hasText: meta.pageMapping.some(p => !!(p.text || p.ocrText)),
      hasThumbnail: false,
    };
  });
}

export async function applyPublicPreferences(docs: RecordDoc[]): Promise<RecordDoc[]> {
  const preferences = await getPublicPrintPreferences(docs.map(doc => doc.id));
  return docs.map((doc, index) => {
    const {classification, ...prefs} = preferences[index] ?? {};
    return {...doc, ...prefs, meta: {...doc.meta, ...classification}};
  });
}

export function isCatalogPrint(doc: RecordDoc) {
  return !!(doc.publicPdfUrl || doc.restoredPdf);
}

export function mergePrints(local: RecordDoc[], published: RecordDoc[]): RecordDoc[] {
  const localIds = new Set(local.map(doc => doc.id));
  const localHashes = new Set(local.map(doc => doc.fileHash));
  return [...local, ...published.filter(doc => !localIds.has(doc.id) && !localHashes.has(doc.fileHash))];
}

export function publicClassification(meta: Metadata): NonNullable<PublicPrintPreferences['classification']> {
  const {title, primarySubjectId, topicIds, materialTypeId, series, tags, relations, review, evidence, updatedAt} = meta;
  return {title, primarySubjectId, topicIds, materialTypeId, series, tags, relations, review, evidence, updatedAt};
}
