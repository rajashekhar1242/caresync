import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  AlertCircle,
  Shield,
  Stethoscope,
  KeyRound,
  ArrowRight,
  Database,
  Lock,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function StaffPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b pb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Staff & User Management</h1>
          <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300">
            Backend API Not Yet Available
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          Hospital personnel accounts, administrative roles, and credential provisioning.
        </p>
      </div>

      {/* Primary Status Banner */}
      <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/10">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <CardTitle className="text-base text-amber-900 dark:text-amber-200">
              Staff Management REST API Capability Pending
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-amber-800 dark:text-amber-300 mt-1">
            CareSync currently enforces centralized staff account provisioning through database migrations (<code className="font-mono">V11__seed_staff_accounts.sql</code>) and automated bootstrap runners (<code className="font-mono">StaffAccountBootstrapRunner.java</code>). A generic REST controller for dynamic receptionist and nurse account lifecycle management is scheduled for a future backend milestone.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2 mt-2">
            <Link to="/admin/doctors">
              <Button size="sm" variant="outline" className="text-xs bg-background">
                <Stethoscope className="h-3.5 w-3.5 mr-1.5" />
                Manage Physician Accounts
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Current Provisioned System Roles Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Administrator */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Badge variant="destructive">ADMIN</Badge>
              <Shield className="h-4 w-4 text-destructive" />
            </div>
            <CardTitle className="text-sm font-semibold mt-2">Hospital Administrator</CardTitle>
            <CardDescription className="text-xs">System configuration, financial reports, audit trails</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p><strong>Provisioning:</strong> Bootstrapped at startup</p>
            <p><strong>Permissions:</strong> Full read/write across all modules</p>
          </CardContent>
        </Card>

        {/* Doctor */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Badge variant="info">DOCTOR</Badge>
              <Stethoscope className="h-4 w-4 text-sky-600" />
            </div>
            <CardTitle className="text-sm font-semibold mt-2">Attending Physician</CardTitle>
            <CardDescription className="text-xs">Patient queue, consultations, and prescriptions</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p><strong>Provisioning:</strong> Dynamic via <Link to="/admin/doctors" className="text-primary hover:underline font-medium">Physician Directory</Link></p>
            <p><strong>Permissions:</strong> Clinical scope, own schedule, and patients</p>
          </CardContent>
        </Card>

        {/* Receptionist */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Badge variant="secondary">RECEPTIONIST</Badge>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-sm font-semibold mt-2">Front Desk Receptionist</CardTitle>
            <CardDescription className="text-xs">Patient check-in, bookings, and billing cashier</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p><strong>Provisioning:</strong> Seeded via <code className="font-mono text-[11px]">V11__seed_staff_accounts</code></p>
            <p><strong>Permissions:</strong> Reception desk, appointment check-in, cashiering</p>
          </CardContent>
        </Card>
      </div>

      {/* Architecture Guidance Box */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Backend Integration Specifications
          </CardTitle>
          <CardDescription className="text-xs">
            Documentation for backend engineers implementing Phase 21 Staff REST APIs
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>
            To integrate full staff management in the frontend, the Spring Boot backend must expose:
          </p>
          <ul className="list-disc list-inside space-y-1 font-mono text-[11px] bg-muted/30 p-3 rounded-md">
            <li>GET /api/staff - Paginated staff user accounts filtered by role and active status</li>
            <li>POST /api/staff - Provision receptionist, nurse, or clerk accounts</li>
            <li>PUT /api/staff/{'{id}'} - Update staff profile and active flag</li>
            <li>PATCH /api/staff/{'{id}'}/reset-password - Administrative password reset</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
