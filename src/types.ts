export type UserRole = 'super_admin' | 'moderator' | 'employee' | 'management';

export interface User {
  id: number;
  email: string | null;
  mobile: string | null;
  full_name: string;
  role: UserRole;
  employee_code: string;
  designation: string;
  location_id: number | null;
  location_name?: string;
  location_code?: string;
  location_city?: string;
  department_id: number | null;
  department_name?: string;
  department_cost_center?: string;
  reporting_manager: string;
  must_reset_password: number;
  is_active: number;
  specialization?: string;
  assigned_locations?: string;
  capacity?: number;
  rating?: number;
  mod_status?: string;
  last_seen_at?: string | null;
  active_ticket_count?: number;
  completed_ticket_count?: number;
  created_at?: string;
}

export interface Location {
  id: number;
  name: string;
  code: string;
  type: string;
  city: string;
  state: string;
  address: string;
  contact_phone: string;
  is_active: number;
}

export interface Department {
  id: number;
  name: string;
  code: string;
  cost_center: string;
  head_name: string;
  is_active: number;
}

export interface Vendor {
  id: number;
  name: string;
  category: string;
  contact_person: string;
  email: string;
  phone: string;
  gstin: string;
  address: string;
  city: string;
  rating: number;
  is_active: number;
}

export interface Asset {
  id: number;
  asset_tag: string;
  serial_number: string;
  category: string;
  brand: string;
  model: string;
  purchase_date: string;
  purchase_cost: number;
  warranty_expiry: string;
  assigned_user_id: number | null;
  assigned_user_name?: string;
  assigned_user_code?: string;
  location_id: number | null;
  location_name?: string;
  location_code?: string;
  condition: 'Operational' | 'Under Repair' | 'Decommissioned' | 'Spare';
  notes: string;
  maintenance_count?: number;
  total_maintenance_cost?: number;
}

export interface Ticket {
  id: number;
  ticket_number: string;
  reporter_id: number | null;
  reporter_name: string;
  reporter_employee_code: string;
  reporter_department: string;
  reporter_designation: string;
  reporter_mobile: string;
  reporter_email: string;
  reporter_branch: string;
  reporter_city: string;
  reporter_full_location: string;
  reporter_reporting_manager: string;
  location_id: number | null;
  location_name?: string;
  location_code?: string;
  department_id: number | null;
  department_name?: string;
  category: string;
  device_type: string;
  device_name: string;
  asset_id: number | null;
  linked_asset_tag?: string;
  serial_number: string;
  description: string;
  issue_time: string;
  business_impact: 'Low' | 'Moderate' | 'High' | 'Operations Halted';
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  status: string;
  assigned_moderator_id: number | null;
  moderator_name?: string;
  moderator_email?: string;
  deadline: string | null;
  assignment_reason: string;
  first_response_due_at: string | null;
  resolution_due_at: string | null;
  first_responded_at: string | null;
  sla_breached: number;
  sla_breached_at: string | null;
  assigned_at: string | null;
  accepted_at: string | null;
  review_started_at: string | null;
  work_started_at: string | null;
  submitted_for_review_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  total_working_minutes: number;
  visit_count: number;
  parts_replaced: string;
  expenses_incurred: number;
  resolution_description: string;
  employee_feedback: string;
  employee_rating: number | null;
  employee_confirmed_at: string | null;
  admin_verified_at: string | null;
  rejection_reason: string;
  created_at: string;
  updated_at: string;
}

export interface TicketAttachment {
  id: number;
  ticket_id: number;
  file_name: string;
  mime_type: string;
  file_size: number;
  media_type: 'photo' | 'video' | 'document';
  created_at: string;
}

export interface TicketComment {
  id: number;
  ticket_id: number;
  user_id: number | null;
  author_name: string;
  author_role: string;
  channel: 'portal' | 'outlook' | 'whatsapp' | 'internal';
  is_internal: number;
  body: string;
  created_at: string;
}

export interface TicketTimeLog {
  id: number;
  ticket_id: number;
  moderator_id: number;
  moderator_name?: string;
  work_type: string;
  notes: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
}

export interface TicketActivity {
  id: number;
  ticket_id: number;
  actor_name: string;
  action: string;
  details: string;
  created_at: string;
}

export interface DropdownOption {
  id: number;
  list_key: string;
  label: string;
  value: string;
  sort_order: number;
  is_active: number;
}

export interface SlaConfig {
  id: number;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  first_response_minutes: number;
  resolution_hours: number;
  work_start_hour: number;
  work_end_hour: number;
  working_days: string;
  holidays: string;
  auto_escalate: number;
  escalation_email: string;
}

export interface Budget {
  id: number;
  location_id: number;
  location_name: string;
  location_code: string;
  fiscal_year: string;
  period_type: 'annual' | 'monthly';
  month: number | null;
  allocated_amount: number;
  actual_spent: number;
  notes: string;
}

export interface Expense {
  id: number;
  location_id: number;
  location_name: string;
  location_code: string;
  ticket_id: number | null;
  ticket_number?: string;
  vendor_id: number | null;
  vendor_name?: string;
  category: string;
  amount: number;
  expense_date: string;
  invoice_number: string;
  invoice_file_name: string;
  description: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  remarks: string;
  submitted_by_name?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
}

export interface NotificationItem {
  id: number;
  type: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  message: string;
  link_type: string;
  link_id: string;
  is_read: number;
  created_at: string;
}

export interface ChatContact {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  specialization: string;
  mod_status: string;
  is_online: boolean;
  unread_count: number;
  last_message: string | null;
  last_message_at: string | null;
}

export interface ChatMessage {
  id: number;
  sender_id: number;
  receiver_id: number;
  message: string;
  is_read: number;
  created_at: string;
}
