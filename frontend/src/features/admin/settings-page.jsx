import * as React from 'react';
import {
  Settings,
  Shield,
  Server,
  Database,
  Lock,
  Clock,
  Activity,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">System Configuration & Security</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Hospital operating parameters, security guarantees, database schema, and runtime policies.
        </p>
      </div>

      {/* Read-Only Notice */}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-300 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Centralized Configuration Management</p>
          <p className="mt-0.5 text-muted-foreground">
            System configuration parameters are centrally version-controlled in the Spring Boot application environment (<code className="font-mono text-[11px]">application.yml</code>) and protected by Flyway database migrations. Dynamic in-browser modification is disabled for compliance and data integrity.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Security & Authentication Policy */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Authentication & Token Security</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Stateless JWT session and cryptographic controls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b">
              <span className="text-muted-foreground">Access Token Lifetime</span>
              <span className="font-semibold">900 seconds (15 minutes)</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b">
              <span className="text-muted-foreground">Access Token Storage</span>
              <Badge variant="outline">In-Memory Closure Only</Badge>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b">
              <span className="text-muted-foreground">Refresh Token Lifetime</span>
              <span className="font-semibold">604,800 seconds (7 days)</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b">
              <span className="text-muted-foreground">Refresh Token Storage</span>
              <Badge variant="outline">Session-Scoped (sessionStorage)</Badge>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b">
              <span className="text-muted-foreground">Token Family Rotation</span>
              <Badge variant="success">Strict Replay Revocation Active</Badge>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-muted-foreground">Password Hashing</span>
              <span className="font-mono">BCrypt (Strength: 10)</span>
            </div>
          </CardContent>
        </Card>

        {/* Clinical Infrastructure */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-base">Clinical Infrastructure</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Backend runtime environment and database specifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b">
              <span className="text-muted-foreground">Backend Architecture</span>
              <span className="font-semibold">Spring Boot 4.1.2 Modular Monolith</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b">
              <span className="text-muted-foreground">Java Virtual Machine</span>
              <span className="font-mono">Java 25 (OpenJDK)</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b">
              <span className="text-muted-foreground">Relational Database</span>
              <span className="font-semibold">PostgreSQL 16</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b">
              <span className="text-muted-foreground">Database Migrations</span>
              <Badge variant="success">12 Applied (V1 - V12)</Badge>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b">
              <span className="text-muted-foreground">Default Time Zone</span>
              <span className="font-mono">Asia/Kolkata</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-muted-foreground">Rate Limiting Filter</span>
              <span className="font-mono">Bucket4j (10 req/s, 5 auth/min)</span>
            </div>
          </CardContent>
        </Card>

        {/* Operational Compliance */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Operational Compliance & Data Scoping</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Healthcare data protection and clinical isolation rules
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3 text-xs">
            <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Zero-PII Waiting Boards</span>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Public waiting room boards emit only anonymized token numbers without patient names or diagnoses.
              </p>
            </div>

            <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Synchronous Audit Logs</span>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Patient record lookups and invoice operations write to the immutable append-only audit trail in the same transaction.
              </p>
            </div>

            <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Client Cache Isolation</span>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Query caches are wiped on logout to prevent patient data leakage across user sessions on shared terminals.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
