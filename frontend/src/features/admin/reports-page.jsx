import * as React from 'react';
import {
  FileBarChart,
  Calendar,
  Filter,
  DollarSign,
  TrendingUp,
  Building2,
  Users,
  Award,
  RefreshCw,
  AlertCircle,
  Percent,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useRevenueReport,
  useAppointmentsByDepartment,
  useNoShowRate,
  useTopDoctors,
} from '@/hooks/use-reports';

export function ReportsPage() {
  // Preset 30-day date range
  const todayStr = React.useMemo(() => new Date().toISOString().split('T')[0], []);
  const thirtyDaysAgoStr = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  }, []);

  const [from, setFrom] = React.useState(thirtyDaysAgoStr);
  const [to, setTo] = React.useState(todayStr);
  const [groupBy, setGroupBy] = React.useState('DAY');
  const [activeTab, setActiveTab] = React.useState('revenue');

  // Queries
  const revenueQuery = useRevenueReport({ from, to, groupBy });
  const deptQuery = useAppointmentsByDepartment({ from, to });
  const noShowQuery = useNoShowRate({ from, to });
  const topDoctorsQuery = useTopDoctors({ from, to, limit: 10 });

  const handleRefresh = () => {
    revenueQuery.refetch();
    deptQuery.refetch();
    noShowQuery.refetch();
    topDoctorsQuery.refetch();
  };

  // Prepare revenue chart data
  const revenueChartData = React.useMemo(() => {
    if (!revenueQuery.data?.buckets) return [];
    return revenueQuery.data.buckets.map((b) => ({
      period: b.period,
      Invoiced: parseFloat(b.invoiced || '0'),
      Collected: parseFloat(b.collected || '0'),
      Credited: parseFloat(b.credited || '0'),
      Net: parseFloat(b.net || '0'),
    }));
  }, [revenueQuery.data?.buckets]);

  // Prepare dept chart data
  const deptChartData = React.useMemo(() => {
    if (!deptQuery.data?.departments) return [];
    return deptQuery.data.departments.map((d) => ({
      name: d.departmentName,
      Total: d.total,
      Completed: d.completed,
      Cancelled: d.cancelled,
      NoShow: d.noShow,
    }));
  }, [deptQuery.data?.departments]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Financial & Operational Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Audit-grade revenue accounting, department utilization, attendance rates, and physician rankings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            aria-label="Refresh reports"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Date Range & Grouping Controls */}
      <div className="flex flex-wrap items-center gap-3 bg-card p-3.5 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">From:</span>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 text-xs w-36"
            aria-label="Report from date"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">To:</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 text-xs w-36"
            aria-label="Report to date"
          />
        </div>

        {activeTab === 'revenue' && (
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-xs font-semibold text-muted-foreground">Group By:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs"
              aria-label="Group revenue by"
            >
              <option value="DAY">Daily</option>
              <option value="WEEK">Weekly</option>
              <option value="MONTH">Monthly</option>
            </select>
          </div>
        )}
      </div>

      {/* Reports Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
          <TabsTrigger value="revenue" className="text-xs">
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
            Revenue Analytics
          </TabsTrigger>
          <TabsTrigger value="departments" className="text-xs">
            <Building2 className="h-3.5 w-3.5 mr-1.5" />
            Department Utilization
          </TabsTrigger>
          <TabsTrigger value="attendance" className="text-xs">
            <Percent className="h-3.5 w-3.5 mr-1.5" />
            No-Show & Attendance
          </TabsTrigger>
          <TabsTrigger value="doctors" className="text-xs">
            <Award className="h-3.5 w-3.5 mr-1.5" />
            Top Physicians
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Revenue Analytics */}
        <TabsContent value="revenue" className="space-y-4">
          {revenueQuery.isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : revenueQuery.isError ? (
            <ErrorState
              title="Failed to load revenue"
              message="Could not retrieve revenue figures."
              onRetry={() => revenueQuery.refetch()}
            />
          ) : (
            <div className="space-y-4">
              {/* Financial Semantics Summary Cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-1 pt-3">
                    <CardTitle className="text-xs text-muted-foreground">Total Invoiced</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <p className="text-xl font-bold text-foreground">
                      {revenueQuery.data?.currency || 'INR'} {revenueQuery.data?.totals?.invoiced || '0.00'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Billed service charges</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-1 pt-3">
                    <CardTitle className="text-xs text-muted-foreground">Actual Collections</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <p className="text-xl font-bold text-emerald-600">
                      {revenueQuery.data?.currency || 'INR'} {revenueQuery.data?.totals?.collected || '0.00'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Paid counter revenue</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-1 pt-3">
                    <CardTitle className="text-xs text-muted-foreground">Credited / Refunded</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <p className="text-xl font-bold text-destructive">
                      {revenueQuery.data?.currency || 'INR'} {revenueQuery.data?.totals?.credited || '0.00'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Approved credit notes</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-1 pt-3">
                    <CardTitle className="text-xs text-muted-foreground">Net Revenue</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <p className="text-xl font-bold text-primary">
                      {revenueQuery.data?.currency || 'INR'} {revenueQuery.data?.totals?.net || '0.00'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Collections minus credits</p>
                  </CardContent>
                </Card>
              </div>

              {/* Revenue Timeline Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Revenue Periodic Timeline</CardTitle>
                  <CardDescription className="text-xs">
                    Comparison across {groupBy.toLowerCase()} intervals
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {revenueChartData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                      No revenue transactions found in this date range.
                    </div>
                  ) : (
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="areaColl" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                            </linearGradient>
                            <linearGradient id="areaInv" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0284c7" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="period" fontSize={11} />
                          <YAxis fontSize={11} />
                          <Tooltip formatter={(v) => [`₹${v}`, '']} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px' }} />
                          <Legend wrapperStyle={{ fontSize: '12px' }} />
                          <Area type="monotone" dataKey="Collected" stroke="#10b981" fillOpacity={1} fill="url(#areaColl)" />
                          <Area type="monotone" dataKey="Invoiced" stroke="#0284c7" fillOpacity={1} fill="url(#areaInv)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tabular Buckets */}
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 font-medium text-muted-foreground border-b">
                    <tr>
                      <th className="px-3 py-2">Period</th>
                      <th className="px-3 py-2">Invoices</th>
                      <th className="px-3 py-2">Invoiced (₹)</th>
                      <th className="px-3 py-2">Collected (₹)</th>
                      <th className="px-3 py-2">Credited (₹)</th>
                      <th className="px-3 py-2">Net (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(revenueQuery.data?.buckets || []).map((b, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono font-medium">{b.period}</td>
                        <td className="px-3 py-2">{b.invoiceCount}</td>
                        <td className="px-3 py-2">₹{b.invoiced}</td>
                        <td className="px-3 py-2 text-emerald-600 font-medium">₹{b.collected}</td>
                        <td className="px-3 py-2 text-destructive">₹{b.credited}</td>
                        <td className="px-3 py-2 font-bold">₹{b.net}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Department Utilization */}
        <TabsContent value="departments" className="space-y-4">
          {deptQuery.isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : deptQuery.isError ? (
            <ErrorState title="Load error" message="Could not retrieve department figures." />
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Consultations by Department</CardTitle>
                  <CardDescription className="text-xs">
                    Total booked, completed, cancelled, and no-shows per department
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {deptChartData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                      No department data for this date range.
                    </div>
                  ) : (
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={deptChartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="name" fontSize={11} angle={-20} textAnchor="end" />
                          <YAxis fontSize={11} allowDecimals={false} />
                          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px' }} />
                          <Legend wrapperStyle={{ fontSize: '12px' }} />
                          <Bar dataKey="Total" fill="#0284c7" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Cancelled" fill="#ef4444" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="NoShow" fill="#64748b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Department Table */}
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 font-medium text-muted-foreground border-b">
                    <tr>
                      <th className="px-3 py-2">Department</th>
                      <th className="px-3 py-2">Total</th>
                      <th className="px-3 py-2">Completed</th>
                      <th className="px-3 py-2">Cancelled</th>
                      <th className="px-3 py-2">No Show</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(deptQuery.data?.departments || []).map((d) => (
                      <tr key={d.departmentId} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{d.departmentName}</td>
                        <td className="px-3 py-2 font-bold">{d.total}</td>
                        <td className="px-3 py-2 text-emerald-600 font-medium">{d.completed}</td>
                        <td className="px-3 py-2 text-destructive">{d.cancelled}</td>
                        <td className="px-3 py-2 text-muted-foreground">{d.noShow}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tab 3: No-Show & Attendance */}
        <TabsContent value="attendance" className="space-y-4">
          {noShowQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : noShowQuery.isError ? (
            <ErrorState title="Error" message="Could not retrieve attendance statistics." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-1 pt-3">
                  <CardTitle className="text-xs text-muted-foreground">No-Show Rate</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <p className="text-2xl font-bold text-amber-600">
                    {noShowQuery.data?.noShowRate != null
                      ? `${(noShowQuery.data.noShowRate * 100).toFixed(1)}%`
                      : '0.0%'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Of all scheduled slots</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1 pt-3">
                  <CardTitle className="text-xs text-muted-foreground">Total Bookings</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <p className="text-2xl font-bold text-foreground">
                    {noShowQuery.data?.counts?.total ?? 0}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Appointments</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1 pt-3">
                  <CardTitle className="text-xs text-muted-foreground">Completed Consultations</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <p className="text-2xl font-bold text-emerald-600">
                    {noShowQuery.data?.counts?.completed ?? 0}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Attended</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1 pt-3">
                  <CardTitle className="text-xs text-muted-foreground">Patient No-Shows</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <p className="text-2xl font-bold text-destructive">
                    {noShowQuery.data?.counts?.noShow ?? 0}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Missed slots</p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Tab 4: Top Performing Doctors */}
        <TabsContent value="doctors" className="space-y-4">
          {topDoctorsQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : topDoctorsQuery.isError ? (
            <ErrorState title="Error" message="Could not retrieve doctor rankings." />
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                  <tr>
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Physician</th>
                    <th className="px-4 py-3">Specialization</th>
                    <th className="px-4 py-3">Completed Consultations</th>
                    <th className="px-4 py-3">Revenue Generated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(topDoctorsQuery.data?.entries || []).map((entry, index) => (
                    <tr key={entry.doctorId} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-bold text-foreground">
                        #{index + 1}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        Dr. {entry.doctorName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {entry.specializationName || 'Specialist'}
                      </td>
                      <td className="px-4 py-3 font-medium text-emerald-600">
                        {entry.completedAppointments}
                      </td>
                      <td className="px-4 py-3 font-bold">
                        ₹{entry.revenue || '0.00'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
