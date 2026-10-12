'use server';

import { revalidatePath } from 'next/cache';

import { GraphQLClientError, graphqlRequest } from './graphql-client';

/**
 * Admin mutations.
 *
 * The API enforces the role on every one of these, so the returned message is
 * already safe to show. Successful writes invalidate the tagged admin caches so
 * the next render reflects the change.
 */

export interface AdminActionResult {
  readonly error?: string;
  readonly ok?: boolean;
}

function messageFor(error: unknown): AdminActionResult {
  if (error instanceof GraphQLClientError) {
    if (error.code === 'FORBIDDEN') return { error: 'You do not have permission to do that' };
    if (error.code === 'UNAUTHENTICATED') return { error: 'Your session has expired' };
    return { error: error.message };
  }
  console.error('[admin] action failed', error);
  return { error: 'Something went wrong. Please try again.' };
}

function refresh(): void {
  revalidatePath('/admin');
  revalidatePath('/admin/users');
  revalidatePath('/admin/bookings');
  revalidatePath('/admin/tickets');
  revalidatePath('/admin/taxonomy');
  revalidatePath('/admin/reports');
}

export async function setUserRoleAction(
  userId: string,
  role: string,
): Promise<AdminActionResult> {
  try {
    await graphqlRequest<unknown, { userId: string; role: string }>(
      'mutation SetRole($userId: ID!, $role: UserRole!) { setUserRole(userId: $userId, role: $role) { id role } }',
      { userId, role },
    );
    refresh();
    return { ok: true };
  } catch (error) {
    return messageFor(error);
  }
}

export async function unlockUserAction(userId: string): Promise<AdminActionResult> {
  try {
    await graphqlRequest<unknown, { userId: string }>(
      'mutation Unlock($userId: ID!) { unlockUser(userId: $userId) }',
      { userId },
    );
    refresh();
    return { ok: true };
  } catch (error) {
    return messageFor(error);
  }
}

export async function issueTicketAction(input: {
  bookingPnr: string;
  segmentId: string;
  passengerId: string;
  ticketNumber: string;
}): Promise<AdminActionResult> {
  try {
    await graphqlRequest<unknown, { input: typeof input }>(
      `mutation Issue($input: IssueTicketInput!) {
         issueTicket(input: $input) { id ticketNumber status }
       }`,
      { input },
    );
    refresh();
    return { ok: true };
  } catch (error) {
    return messageFor(error);
  }
}

export async function voidTicketAction(ticketId: string): Promise<AdminActionResult> {
  try {
    await graphqlRequest<unknown, { ticketId: string }>(
      'mutation Void($ticketId: ID!) { voidTicket(ticketId: $ticketId) }',
      { ticketId },
    );
    refresh();
    return { ok: true };
  } catch (error) {
    return messageFor(error);
  }
}

export async function upsertCategoryAction(input: {
  slug: string;
  name: string;
  description?: string | null;
  parentSlug?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<AdminActionResult> {
  try {
    await graphqlRequest<unknown, { input: typeof input }>(
      `mutation UpsertCategory($input: UpsertCategoryInput!) {
         upsertCategory(input: $input) { id slug }
       }`,
      { input },
    );
    refresh();
    return { ok: true };
  } catch (error) {
    return messageFor(error);
  }
}

export async function deleteCategoryAction(id: string): Promise<AdminActionResult> {
  try {
    await graphqlRequest<unknown, { id: string }>(
      'mutation Delete($id: ID!) { deleteCategory(id: $id) }',
      { id },
    );
    refresh();
    return { ok: true };
  } catch (error) {
    return messageFor(error);
  }
}

export async function upsertProductAction(input: {
  sku: string;
  name: string;
  description?: string | null;
  priceMinor: number;
  currency?: string;
  kind?: string;
  categoryId: string;
  isActive?: boolean;
}): Promise<AdminActionResult> {
  try {
    await graphqlRequest<unknown, { input: typeof input }>(
      `mutation UpsertProduct($input: UpsertProductInput!) {
         upsertProduct(input: $input) { id sku }
       }`,
      { input },
    );
    refresh();
    return { ok: true };
  } catch (error) {
    return messageFor(error);
  }
}

export async function deleteProductAction(id: string): Promise<AdminActionResult> {
  try {
    await graphqlRequest<unknown, { id: string }>(
      'mutation Delete($id: ID!) { deleteProduct(id: $id) }',
      { id },
    );
    refresh();
    return { ok: true };
  } catch (error) {
    return messageFor(error);
  }
}
