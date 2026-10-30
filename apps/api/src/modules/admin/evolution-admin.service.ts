import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { recordAudit } from '../../lib/audit';

export interface GlobalEvolutionConfig {
  serverUrl: string | null;
  hasApiKey: boolean;
  isConfigured: boolean;
  source: 'database' | 'environment' | 'none';
}

/**
 * Retrieves the global Evolution API server config:
 * Checks database SystemSetting table first, then falls back to environment variables.
 */
export async function getGlobalEvolutionConfig(): Promise<GlobalEvolutionConfig & { apiKey?: string }> {
  let dbUrl: string | null = null;
  let dbKey: string | null = null;

  try {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: ['evolution_server_url', 'evolution_api_key'] } },
    });
    for (const r of rows) {
      if (r.key === 'evolution_server_url' && r.value) dbUrl = r.value.trim();
      if (r.key === 'evolution_api_key' && r.value) dbKey = r.value.trim();
    }
  } catch {
    // If the table is not created yet, gracefully fallback
  }

  if (dbUrl) {
    const key = dbKey || env.EVOLUTION_API_KEY || undefined;
    return {
      serverUrl: dbUrl,
      hasApiKey: !!key,
      isConfigured: !!(dbUrl && key),
      source: 'database',
      apiKey: key,
    };
  }

  if (env.EVOLUTION_SERVER_URL) {
    return {
      serverUrl: env.EVOLUTION_SERVER_URL,
      hasApiKey: !!env.EVOLUTION_API_KEY,
      isConfigured: !!(env.EVOLUTION_SERVER_URL && env.EVOLUTION_API_KEY),
      source: 'environment',
      apiKey: env.EVOLUTION_API_KEY || undefined,
    };
  }

  return {
    serverUrl: null,
    hasApiKey: false,
    isConfigured: false,
    source: 'none',
  };
}

/**
 * Saves or updates the global Evolution API configuration in the database.
 */
export async function saveGlobalEvolutionConfig(input: {
  serverUrl: string;
  apiKey?: string;
  actorId: string;
}) {
  const url = input.serverUrl.trim().replace(/\/$/, '');

  await prisma.systemSetting.upsert({
    where: { key: 'evolution_server_url' },
    create: { key: 'evolution_server_url', value: url },
    update: { value: url },
  });

  if (input.apiKey && input.apiKey.trim()) {
    await prisma.systemSetting.upsert({
      where: { key: 'evolution_api_key' },
      create: { key: 'evolution_api_key', value: input.apiKey.trim() },
      update: { value: input.apiKey.trim() },
    });
  }

  recordAudit({
    actorId: input.actorId,
    action: 'evolution.config_updated',
    targetType: 'SystemSetting',
    description: `Super Admin a mis à jour le serveur Evolution API global (${url})`,
    metadata: { serverUrl: url, hasNewApiKey: Boolean(input.apiKey) },
  });

  return getGlobalEvolutionConfig();
}

/**
 * Tests the connection to an Evolution API server by requesting its instances.
 */
export async function testEvolutionConnection(serverUrl: string, apiKey: string) {
  const cleanUrl = serverUrl.trim().replace(/\/$/, '');
  try {
    const res = await fetch(`${cleanUrl}/instance/fetchInstances`, {
      method: 'GET',
      headers: {
        apikey: apiKey.trim(),
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: 'URL atteinte, mais la clé API globale est invalide (401/403 Non Autorisé)',
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: `Le serveur Evolution API a répondu avec le statut HTTP ${res.status}`,
      };
    }

    const data = (await res.json().catch(() => null)) as unknown;
    const instancesCount = Array.isArray(data) ? data.length : 0;

    return {
      ok: true,
      instancesCount,
      message: `Connexion réussie ! ${instancesCount} instance(s) détectée(s) sur le serveur.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('fetch failed') || message.includes('ENOTFOUND')) {
      return {
        ok: false,
        error: `Impossible de résoudre l'adresse ${cleanUrl}. Vérifiez le nom de domaine DNS ou l'IP du serveur.`,
      };
    }
    if (message.includes('timeout') || message.includes('aborted')) {
      return {
        ok: false,
        error: `Délai d'attente dépassé (timeout) en tentant de joindre ${cleanUrl}. Vérifiez les ports 80/443.`,
      };
    }
    return {
      ok: false,
      error: `Erreur de connexion : ${message}`,
    };
  }
}
