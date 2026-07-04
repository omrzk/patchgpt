export interface MissingPatchRef {
  kb: string;
  title?: string;
  classification?: string;
  releaseDate?: string;
}

export interface DiscoveredServer {
  id: string;
  name: string;
  os: string;
  role?: string;
  ip?: string;
  pendingReboot?: boolean;
  missingKbs: MissingPatchRef[];
}

export interface ConnectorResult {
  source: string;
  serversScanned: number;
  missingDetected: number;
  scannedAt: string;
  simulated: boolean;
}

export interface Connector {
  name: string;
  description: string;
  isConfigured(): boolean;
  fetchServers(): Promise<DiscoveredServer[]>;
}

/** Client-credentials token for Azure AD-protected APIs (ARM, Microsoft Graph). */
export async function aadToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  scope: string
): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    }),
  });
  if (!res.ok) throw new Error(`Azure AD token request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}
