import { cors } from 'hono/cors';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { Hono, type Context } from 'hono';

import type { AuthenticatedSession, SessionSummary, UserDirectoryPage } from '@verdeo/auth';
import {
  AIExecutionListResponseSchema,
  AuditEventListResponseSchema,
  AuditEventQuerySchema,
  AuditFacetsResponseSchema,
  AIProviderConfigListResponseSchema,
  EmailTestRequestSchema,
  EmailTestResponseSchema,
  IntegrationCredentialListResponseSchema,
  IntegrationCredentialUpsertRequestSchema,
  AIProviderConfigUpsertRequestSchema,
  AIPromptSummaryListResponseSchema,
  AIPromptDetailSchema,
  AIPromptVersionActivateRequestSchema,
  AIPromptVersionCreateRequestSchema,
  AITaskRunRequestSchema,
  AITaskRunResponseSchema,
  AddressGeocodingConfirmRequestSchema,
  AddressGeocodingCreateRequestSchema,
  AddressGeocodingParamSchema,
  AddressGeocodingRejectRequestSchema,
  AddressGeocodingRequestSchema,
  ChatContactListResponseSchema,
  ChatConversationListResponseSchema,
  ChatConversationOpenRequestSchema,
  ChatConversationParamSchema,
  ChatLinksResponseSchema,
  ChatLocationCreateRequestSchema,
  ChatMessageCreateRequestSchema,
  ChatMessageListResponseSchema,
  ChatMessageQuerySchema,
  ChatHeartbeatRequestSchema,
  ChatMessageSchema,
  ChatPresenceEntrySchema,
  ChatReferenceCreateRequestSchema,
  ChatPresenceListResponseSchema,
  ChatPresenceStatusListResponseSchema,
  ChatPurgeResponseSchema,
  ChatRoleLinkRequestSchema,
  ChatUserLinkRequestSchema,
  CustomerAddressParamSchema,
  CustomerAddressCreateRequestSchema,
  CustomerAddressSchema,
  CustomerAddressUpdateRequestSchema,
  CustomerCreateRequestSchema,
  CustomerDetailSchema,
  CustomerIdentityCreateRequestSchema,
  CustomerIdentitySchema,
  CustomerIdentityUpdateRequestSchema,
  CustomerImportResponseSchema,
  CustomerListResponseSchema,
  CustomerSelfServiceSchema,
  CustomerExportQuerySchema,
  CustomerListQuerySchema,
  CustomerPreferenceCreateRequestSchema,
  CustomerPreferenceSchema,
  CustomerPreferenceUpdateRequestSchema,
  CustomerRelationParamSchema,
  CustomerRestrictionCreateRequestSchema,
  CustomerRestrictionSchema,
  CustomerRestrictionUpdateRequestSchema,
  CustomerUpdateRequestSchema,
  CashCollectionListResponseSchema,
  CashCollectionRequestSchema,
  CashCollectionSchema,
  CashSettlementRequestSchema,
  DeliveryMyStopListResponseSchema,
  DeliveryRouteCreateRequestSchema,
  DeliveryRouteDetailSchema,
  DeliveryRouteListResponseSchema,
  DeliveryStopAssignRequestSchema,
  DeliveryStopReorderRequestSchema,
  DeliveryStopStatusUpdateRequestSchema,
  DeliveryTriggerRequestSchema,
  DeliveryTriggerResponseSchema,
  HealthResponseSchema,
  CycleIdParamSchema,
  GeographicZoneCreateRequestSchema,
  GeographicZoneListResponseSchema,
  GeographicZoneSchema,
  GeographicZoneUpdateRequestSchema,
  IdParamSchema,
  OperatingSiteCreateRequestSchema,
  OperatingSiteListResponseSchema,
  OperatingSiteSchema,
  OperatingSiteUpdateRequestSchema,
  HelpArticleListResponseSchema,
  HelpArticleSchema,
  HelpArticleUpsertRequestSchema,
  KitchenSummaryResponseSchema,
  LabelListResponseSchema,
  LabelSettingsSchema,
  LabelSettingsUpdateRequestSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  MenuCatalogSettingsListResponseSchema,
  MenuCatalogSettingsUpdateRequestSchema,
  MenuCreateRequestSchema,
  MenuDistributeRequestSchema,
  MenuDistributionResponseSchema,
  MenuListResponseSchema,
  MenuPricesUpdateRequestSchema,
  MessageTemplateListResponseSchema,
  MessageTemplateSchema,
  MessageTemplateUpsertRequestSchema,
  MessagingAccountCreateRequestSchema,
  MessagingAccountListResponseSchema,
  MessagingAccountSchema,
  MessagingAccountUpdateRequestSchema,
  MessagingConversationListResponseSchema,
  MessagingMessageListResponseSchema,
  MessagingSendRequestSchema,
  MeResponseSchema,
  OrderCreateRequestSchema,
  OrderListQuerySchema,
  OrderPageResponseSchema,
  OrderRevisionListResponseSchema,
  OrderSchema,
  OrderStatusHistoryResponseSchema,
  OrderTransitionRequestSchema,
  OrderUpdateRequestSchema,
  OAuthExchangeRequestSchema,
  ProfileUpdateRequestSchema,
  ProductionActualListResponseSchema,
  ProductionReportRequestSchema,
  ProductionSnapshotListResponseSchema,
  ProductionSnapshotRequestSchema,
  ProductionSnapshotSchema,
  PublicOperatingSiteListResponseSchema,
  PublicOrderCreateRequestSchema,
  PublicOrderTrackRequestSchema,
  PublicOrderTrackResponseSchema,
  PaymentListResponseSchema,
  PaymentMethodListResponseSchema,
  PaymentMethodsUpdateRequestSchema,
  PaymentsDashboardSchema,
  ScopeResponseSchema,
  SessionIdParamSchema,
  SessionListResponseSchema,
  SurplusConfigSchema,
  SurplusConfigUpdateRequestSchema,
  SurplusReportResponseSchema,
  SurplusWriteoffRequestSchema,
  SurveyCreateRequestSchema,
  SurveyListResponseSchema,
  SurveyPublicSchema,
  SurveyResultsSchema,
  SurveySchema,
  SurveySendRequestSchema,
  SurveySendResponseSchema,
  SurveySubmitRequestSchema,
  SurveyUpdateRequestSchema,
  AccessTokenIssueRequestSchema,
  AccessTokenIssuedResponseSchema,
  AccessTokenListResponseSchema,
  AccessTokenRedeemRequestSchema,
  MediaAssetListResponseSchema,
  MediaAssetSchema,
  PageCreateRequestSchema,
  PageDetailSchema,
  PageDraftUpdateRequestSchema,
  PageListResponseSchema,
  PagePublicResponseSchema,
  PagePublishRequestSchema,
  PageRevisionListResponseSchema,
  PageRevisionSchema,
  PermissionCatalogResponseSchema,
  RoleListResponseSchema,
  StatsOverviewSchema,
  StatsQuerySchema,
  UserAdminDetailSchema,
  UserListQuerySchema,
  UserListResponseSchema,
  UserPermissionOverridesUpdateRequestSchema,
  UserRolesUpdateRequestSchema,
  UserStatusUpdateRequestSchema,
  type ApiErrorCode,
  type AIProviderConfigUpsertRequest,
  type IntegrationCredentialUpsertRequest,
  type AddressGeocodingConfirmRequest,
  type AddressGeocodingCreateRequest,
  type ChatLocationCreateRequest,
  type ChatMessageQuery,
  type ChatReferenceCreateRequest,
  type ChatRoleLinkRequest,
  type ChatUserLinkRequest,
  type CustomerCreateRequest,
  type CustomerAddressCreateRequest,
  type CustomerAddressUpdateRequest,
  type CustomerIdentityCreateRequest,
  type CustomerIdentityUpdateRequest,
  type CustomerListQuery,
  type CustomerPreferenceCreateRequest,
  type CustomerPreferenceUpdateRequest,
  type CustomerRestrictionCreateRequest,
  type CustomerRestrictionUpdateRequest,
  type CustomerUpdateRequest,
  type GeographicZoneCreateRequest,
  type GeographicZoneUpdateRequest,
  type HelpArticleUpsertRequest,
  type LabelSettingsUpdateRequest,
  type MessageTemplateUpsertRequest,
  type OperatingSiteCreateRequest,
  type OperatingSiteUpdateRequest,
  type MenuCreateRequest,
  type MenuDistributeRequest,
  type MenuPricesUpdateRequest,
  type OrderCreateRequest,
  type OrderListQuery,
  type OrderTransitionRequest,
  type OrderUpdateRequest,
  type AccessTokenIssueRequest,
  type PageCreateRequest,
  type PageSection,
  type ProductionReportRequest,
  type ProductionSnapshotRequest,
  type PublicOrderCreateRequest,
  type SurplusWriteoffRequest,
  type SurveyCreateRequest,
  type SurveySubmitRequest,
  type SurveyUpdateRequest,
  type UserPermissionOverridesUpdateRequest,
} from '@verdeo/contracts';
import { createRequestId, type Logger } from '@verdeo/observability';

import {
  buildCustomersExcel,
  CUSTOMER_EXPORT_COLUMN_CATALOG,
  DEFAULT_CUSTOMER_EXPORT_COLUMNS,
  type CustomerExportRow,
} from './customer-export.js';
import { renderEmail, type EmailSender } from '@verdeo/email';

import { ContactImportError, parseContactImport } from './integrations/contact-import.js';
import { buildLabelsPrintHtml } from './labels-export.js';
import {
  buildProductionExcel,
  buildProductionPrintHtml,
  buildProductionWhatsAppText,
  productionSnapshotFilenameBase,
} from './production-export.js';
import { requirePermission } from './middleware/authorization.js';

interface AppVariables {
  logger: Logger;
  requestId: string;
  scope: ScopeSelection;
  session: AuthenticatedSession;
}

// `operatingSiteId: null` is the consolidated global view, never a persisted operation (ADR-028).
interface ScopeSelection {
  operatingSiteId: string | null;
}

interface SessionAuthenticator {
  authenticate(token: string): Promise<AuthenticatedSession | null>;
  listForUser(userId: string): Promise<readonly SessionSummary[]>;
  revoke(session: AuthenticatedSession, requestId: string): Promise<void>;
  revokeOwned(
    session: AuthenticatedSession,
    targetSessionId: string,
    requestId: string,
  ): Promise<boolean>;
}

interface UserProfile {
  avatarUrl: string | null;
  displayName: string;
  email: string | null;
  id: string;
}

// Wider than ProfileUpdateRequest (the PATCH /me contract) on purpose: avatarUrl is set only by
// the upload endpoint after a Blob write succeeds, never accepted directly as client JSON input.
interface UserProfileUpdateInput {
  avatarUrl?: string;
  displayName?: string;
}

interface UserDirectory {
  findById(id: string): Promise<{ displayName: string; id: string } | null>;
  findProfileById(id: string): Promise<UserProfile | null>;
  list(afterId: string | undefined, limit: number): Promise<UserDirectoryPage>;
  updateProfile(id: string, input: UserProfileUpdateInput): Promise<UserProfile>;
}

type ScopedInput<T> = T & { operatingSiteId: string | null };

interface ChatEngine {
  listContacts(userId: string): Promise<unknown>;
  listConversations(userId: string): Promise<unknown>;
  listLinks(): Promise<unknown>;
  listMessages(conversationId: string, userId: string, input: ChatMessageQuery): Promise<unknown>;
  heartbeat(userId: string, status: string | undefined): Promise<unknown>;
  listPresence(userId: string): Promise<unknown>;
  listPresenceStatuses(): Promise<unknown>;
  markRead(conversationId: string, userId: string): Promise<void>;
  openDirectConversation(otherUserId: string, context: ChatContext): Promise<unknown>;
  removeUserLink(linkId: string, context: ChatContext): Promise<void>;
  sendLocation(
    conversationId: string,
    input: ChatLocationCreateRequest,
    context: ChatContext,
  ): Promise<unknown>;
  sendMessage(conversationId: string, body: string, context: ChatContext): Promise<unknown>;
  sendReference(
    conversationId: string,
    input: ChatReferenceCreateRequest,
    context: ChatContext,
  ): Promise<unknown>;
  setRoleLink(input: ChatRoleLinkRequest, context: ChatContext): Promise<unknown>;
  purgeExpiredMessages(
    retentionDays: number,
    context: ChatContext,
  ): Promise<{ cutoff: Date; removed: number }>;
  setUserLink(input: ChatUserLinkRequest, context: ChatContext): Promise<unknown>;
}

interface ChatContext {
  actorUserId: string;
  correlationId: string;
  requestId: string;
  source: string;
}

interface ResolvedScope {
  canSelectGlobal: boolean;
  defaultSiteId: string | null;
  sites: readonly { id: string }[];
}

interface GeographyEngine {
  createSite(input: OperatingSiteCreateRequest, context: GeographyContext): Promise<unknown>;
  createZone(input: GeographicZoneCreateRequest, context: GeographyContext): Promise<unknown>;
  listSites(): Promise<unknown>;
  listActiveZones(operatingSiteId: string | null): Promise<unknown>;
  listZones(operatingSiteId: string): Promise<unknown>;
  resolveScope(userId: string, canAccessAllSites: boolean): Promise<ResolvedScope>;
  updateSite(
    id: string,
    input: OperatingSiteUpdateRequest,
    context: GeographyContext,
  ): Promise<unknown>;
  updateZone(
    id: string,
    input: GeographicZoneUpdateRequest,
    context: GeographyContext,
  ): Promise<unknown>;
}

interface GeographyContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

interface LoginResult {
  expiresAt: Date;
  sessionId: string;
  token: string;
}

interface CredentialLogin {
  login(email: string, password: string, requestId: string): Promise<LoginResult | null>;
}

interface OAuthLogin {
  exchange(accessToken: string, requestId: string): Promise<LoginResult | null>;
}

interface OperationsEngine {
  addCustomerAddress(
    customerId: string,
    input: CustomerAddressCreateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  addCustomerIdentity(
    customerId: string,
    input: CustomerIdentityCreateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  addCustomerPreference(
    customerId: string,
    input: CustomerPreferenceCreateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  addCustomerRestriction(
    customerId: string,
    input: CustomerRestrictionCreateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  createCustomer(
    input: ScopedInput<CustomerCreateRequest>,
    context: OperationsContext,
  ): Promise<unknown>;
  importCustomers?(
    inputs: readonly ScopedInput<CustomerCreateRequest>[],
    context: OperationsContext,
  ): Promise<readonly unknown[]>;
  createMenu(input: MenuCreateRequest, context: OperationsContext): Promise<unknown>;
  updateMenu(
    menuId: string,
    input: MenuCreateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  updateMenuPrices(
    menuId: string,
    prices: MenuPricesUpdateRequest['prices'],
    context: OperationsContext,
  ): Promise<unknown>;
  deleteMenu(menuId: string, context: OperationsContext): Promise<void>;
  distributeMenu(
    menuId: string,
    input: MenuDistributeRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  createOrder(input: ScopedInput<OrderCreateRequest>, context: OperationsContext): Promise<unknown>;
  createPublicOrder(input: PublicOrderCreateRequest, context: OperationsContext): Promise<unknown>;
  trackPublicOrder(publicNumber: string, contact: string): Promise<unknown>;
  confirmAddressGeocoding(
    customerId: string,
    addressId: string,
    requestId: string,
    input: AddressGeocodingConfirmRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  currentPublishedMenu(operatingSiteId: string | null): Promise<unknown>;
  exportCustomers(
    input: ScopedInput<Omit<CustomerListQuery, 'cursor' | 'limit'>>,
    context: OperationsContext,
  ): Promise<CustomerExportRow[]>;
  exportOrdersCsv(
    input: ScopedInput<Omit<OrderListQuery, 'cursor' | 'limit'>>,
    context: OperationsContext,
  ): Promise<string>;
  getCustomer(customerId: string, includeSensitive: boolean): Promise<unknown>;
  getAddressGeocodingRequest(
    customerId: string,
    addressId: string,
    requestId: string,
  ): Promise<unknown>;
  getOrder(orderId: string): Promise<unknown>;
  getStatsOverview(filters: {
    from?: string | undefined;
    operatingSiteId?: string | undefined;
    to?: string | undefined;
  }): Promise<unknown>;
  cycleLabels(cycleId: string, operatingSiteId: string | null): Promise<unknown>;
  getLabelSettings(): Promise<unknown>;
  kitchenSummary(cycleId: string, operatingSiteId: string | null): Promise<unknown>;
  listCustomers(input: ScopedInput<CustomerListQuery>, includeSensitive: boolean): Promise<unknown>;
  listMessageTemplates(): Promise<unknown>;
  listMenus(onlyPublished?: boolean): Promise<unknown>;
  listOrders(input: ScopedInput<OrderListQuery>): Promise<unknown>;
  orderHistory(orderId: string): Promise<unknown>;
  orderLabels(orderId: string): Promise<unknown>;
  orderRevisionHistory(orderId: string): Promise<unknown>;
  publishMenu(menuId: string, context: OperationsContext): Promise<unknown>;
  rejectAddressGeocoding(
    customerId: string,
    addressId: string,
    requestId: string,
    reason: string,
    context: OperationsContext,
  ): Promise<unknown>;
  requestAddressGeocoding(
    customerId: string,
    addressId: string,
    input: AddressGeocodingCreateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  transitionOrder(
    orderId: string,
    status: OrderTransitionRequest['status'],
    reason: string | undefined,
    confirmedReversal: boolean,
    allowCycleOverride: boolean,
    context: OperationsContext,
  ): Promise<unknown>;
  updateCustomer(
    customerId: string,
    input: CustomerUpdateRequest,
    includeSensitive: boolean,
    context: OperationsContext,
  ): Promise<unknown>;
  updateCustomerAddress(
    customerId: string,
    addressId: string,
    input: CustomerAddressUpdateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  updateCustomerIdentity(
    customerId: string,
    identityId: string,
    input: CustomerIdentityUpdateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  updateCustomerRestriction(
    customerId: string,
    restrictionId: string,
    input: CustomerRestrictionUpdateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  updateOrder(
    orderId: string,
    input: OrderUpdateRequest,
    allowCycleOverride: boolean,
    context: OperationsContext,
  ): Promise<unknown>;
  updateCustomerPreference(
    customerId: string,
    preferenceId: string,
    input: CustomerPreferenceUpdateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  upsertMessageTemplate(
    input: MessageTemplateUpsertRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  generateProductionSnapshot(
    cycleId: string,
    kind: ProductionSnapshotRequest['kind'],
    operatingSiteId: string | null | undefined,
    context: OperationsContext,
  ): Promise<unknown>;
  getSurplusConfig(): Promise<unknown>;
  listMenuCatalogSettings(): Promise<unknown>;
  listProductionActuals(cycleId: string): Promise<unknown>;
  listProductionSnapshots(cycleId: string): Promise<unknown>;
  reportProduction(
    cycleId: string,
    entries: ProductionReportRequest['entries'],
    context: OperationsContext,
  ): Promise<unknown>;
  setIntuitivoEnabled(
    operatingSiteId: string,
    intuitivoEnabled: boolean,
    context: OperationsContext,
  ): Promise<unknown>;
  setLabelSettings(input: LabelSettingsUpdateRequest, context: OperationsContext): Promise<unknown>;
  setSurplusConfig(coefficientPercent: number, context: OperationsContext): Promise<unknown>;
  surplusReport(cycleId: string): Promise<unknown>;
  writeOffSurplus(
    cycleId: string,
    entries: SurplusWriteoffRequest['entries'],
    context: OperationsContext,
  ): Promise<unknown>;
}

interface OperationsContext {
  actorUserId?: string;
  correlationId: string;
  requestId: string;
  source: string;
}

interface AIConfigurationEngine {
  list(): Promise<unknown>;
  upsert(input: AIProviderConfigUpsertRequest, context: AIConfigurationContext): Promise<unknown>;
}

interface AIConfigurationContext {
  actorUserId: string;
  correlationId: string;
  requestId: string;
  source: string;
}

/** Non-AI third-party keys (maps/geocoding). Same shape as AIConfigurationEngine by design. */
interface IntegrationCredentialsEngine {
  list(): Promise<unknown>;
  upsert(
    input: IntegrationCredentialUpsertRequest,
    context: AIConfigurationContext,
  ): Promise<unknown>;
}

interface AuditQueryEngine {
  listEvents(query: {
    action?: string | undefined;
    actorUserId?: string | undefined;
    before?: string | undefined;
    entityId?: string | undefined;
    entityType?: string | undefined;
    limit: number;
  }): Promise<unknown>;
  listFacets(): Promise<unknown>;
}

interface SurveyEngine {
  createSurvey(input: SurveyCreateRequest, context: SurveyContext): Promise<unknown>;
  getPublicSurvey(token: string): Promise<unknown>;
  getSurvey(surveyId: string): Promise<unknown>;
  getSurveyResults(surveyId: string): Promise<unknown>;
  listSurveys(): Promise<unknown>;
  sendSurvey(surveyId: string, customerId: string, context: SurveyContext): Promise<unknown>;
  submitSurveyResponse(token: string, answers: SurveySubmitRequest['answers']): Promise<unknown>;
  updateSurvey(
    surveyId: string,
    input: SurveyUpdateRequest,
    context: SurveyContext,
  ): Promise<unknown>;
}

interface SurveyContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

interface HelpEngine {
  createArticle(input: HelpArticleUpsertRequest, context: HelpContext): Promise<unknown>;
  deleteArticle(id: string, context: HelpContext): Promise<unknown>;
  listAll(): Promise<unknown>;
  listVisible(permissions: readonly string[]): Promise<unknown>;
  updateArticle(
    id: string,
    input: HelpArticleUpsertRequest,
    context: HelpContext,
  ): Promise<unknown>;
}

interface HelpContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

interface AIPromptEngine {
  activateVersion(
    taskKey: string,
    versionId: string,
    context: AIConfigurationContext,
  ): Promise<unknown>;
  createVersion(
    taskKey: string,
    input: {
      maxTokens: number;
      preferredProviderKey?: string | undefined;
      systemPrompt: string;
      temperature: number;
    },
    context: AIConfigurationContext,
  ): Promise<unknown>;
  getPromptDetail(taskKey: string): Promise<unknown>;
  listPrompts(): Promise<unknown>;
}

interface AITaskEngine {
  listExecutions(taskKey?: string): Promise<unknown>;
  runTask(
    taskKey: string,
    variables: Record<string, string>,
    context: AIConfigurationContext,
  ): Promise<{
    model: string;
    output: unknown;
    promptVersion: number;
    providerKey: string;
    usage: unknown;
  }>;
}

// Doubles as the CMS media upload adapter: same Blob store, same trust boundary (staff-only,
// content-type/size checked before this is ever called), just a different path prefix.
interface AvatarStorageEngine {
  upload(userId: string, bytes: Uint8Array, contentType: string): Promise<{ url: string }>;
  uploadMedia(bytes: Uint8Array, contentType: string): Promise<{ url: string }>;
}

interface UserAdminEngine {
  getDetail(id: string): Promise<unknown>;
  listPermissionsCatalog(): Promise<unknown>;
  listRoles(): Promise<unknown>;
  setPermissionOverrides(
    id: string,
    overrides: UserPermissionOverridesUpdateRequest['overrides'],
    actorUserId: string | undefined,
  ): Promise<unknown>;
  setRoles(
    id: string,
    roleIds: readonly string[],
    actorUserId: string | undefined,
  ): Promise<unknown>;
  setStatus(id: string, active: boolean): Promise<unknown>;
}

interface AccessTokenRedeemOutcome {
  ok: boolean;
  reason?: string;
  session?: LoginResult;
}

interface AccessTokenEngine {
  issue(
    input: AccessTokenIssueRequest,
    createdByUserId: string | undefined,
  ): Promise<{ expiresAt: Date; id: string; token: string }>;
  list(operatingSiteId: string | undefined): Promise<unknown>;
  redeem(token: string, displayName: string | undefined): Promise<AccessTokenRedeemOutcome>;
  revoke(id: string): Promise<void>;
}

interface CmsContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

interface CmsEngine {
  createPage(input: PageCreateRequest, context: CmsContext): Promise<unknown>;
  getPageDetail(slug: string): Promise<unknown>;
  getPublicPage(slug: string): Promise<unknown>;
  listMediaAssets(): Promise<unknown>;
  listPages(): Promise<unknown>;
  listRevisions(slug: string): Promise<unknown>;
  publish(slug: string, revisionId: string, context: CmsContext): Promise<unknown>;
  recordMediaAsset(
    input: { contentType: string; label: string | undefined; url: string },
    uploadedByUserId: string | undefined,
  ): Promise<unknown>;
  saveDraft(slug: string, sections: PageSection[], context: CmsContext): Promise<unknown>;
}

interface MessagingContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

interface MessagingEngine {
  createAccount(
    input: { label: string; phoneNumberId: string; [key: string]: unknown },
    context: MessagingContext,
  ): Promise<unknown>;
  getConversationMessages(conversationId: string): Promise<unknown>;
  handleInboundEvent(
    payload: Record<string, unknown>,
  ): Promise<{ deduped: boolean; routed?: boolean }>;
  listAccounts(): Promise<unknown>;
  listConversations(): Promise<unknown>;
  sendMessage(conversationId: string, body: string, context: MessagingContext): Promise<unknown>;
  updateAccount(
    id: string,
    input: Record<string, unknown>,
    context: MessagingContext,
  ): Promise<unknown>;
  verifyChallenge(
    mode: string | null,
    token: string | null,
    challenge: string | null,
  ): string | null;
  verifySignature(rawBody: string, signatureHeader: string | null): boolean;
}

interface DeliveryContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

interface DeliveryEngine {
  assignStop(
    stopId: string,
    assignedUserId: string | null,
    context: DeliveryContext,
  ): Promise<unknown>;
  createRoute(
    operatingSiteId: string,
    deliveryDate: string,
    label: string | undefined,
    context: DeliveryContext,
  ): Promise<unknown>;
  getRouteDetail(routeId: string): Promise<unknown>;
  listRoutes(operatingSiteId?: string): Promise<unknown>;
  listStopsForUser(userId: string): Promise<unknown>;
  publishRoute(routeId: string, context: DeliveryContext): Promise<unknown>;
  reorderStops(routeId: string, orderedStopIds: readonly string[]): Promise<unknown>;
  triggerMessage(
    stopId: string,
    action: 'ON_MY_WAY' | 'AT_ADDRESS' | 'DELIVERED_THANKS',
    context: DeliveryContext,
  ): Promise<{ reason?: string; sent: boolean }>;
  updateStopStatus(
    stopId: string,
    status: 'pending' | 'en_route' | 'at_address' | 'delivered' | 'skipped',
    actorUserId: string | undefined,
    context: DeliveryContext,
  ): Promise<unknown>;
}

interface PaymentsContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

interface PaymentsEngine {
  dashboard(operatingSiteId?: string): Promise<unknown>;
  listByStatus(status?: string): Promise<unknown>;
  listPaymentMethods(): Promise<unknown>;
  listUnsettledCollections(collectedByUserId?: string): Promise<unknown>;
  updatePaymentMethods(
    methods: readonly { active: boolean; code: string; displayName: string; isCash: boolean }[],
    context: PaymentsContext,
  ): Promise<unknown>;
  recordCollection(
    orderId: string,
    amountMinor: number,
    method: string,
    context: PaymentsContext,
  ): Promise<unknown>;
  settleCollection(
    collectionId: string,
    receivedByUserId: string,
    context: PaymentsContext,
  ): Promise<unknown>;
}

interface CreateAppOptions {
  aiConfiguration?: AIConfigurationEngine;
  aiPrompts?: AIPromptEngine;
  aiTasks?: AITaskEngine;
  appOrigin: string;
  accessTokens?: AccessTokenEngine;
  auditQuery?: AuditQueryEngine;
  surveys?: SurveyEngine;
  help?: HelpEngine;
  avatarStorage?: AvatarStorageEngine;
  cookieSameSite: 'Lax' | 'None';
  chat?: ChatEngine;
  chatRetentionDays?: number | undefined;
  cms?: CmsEngine;
  cronSecret?: string | undefined;
  credentials: CredentialLogin;
  delivery?: DeliveryEngine;
  geography?: GeographyEngine;
  emailSender?: EmailSender | undefined;
  integrationCredentials?: IntegrationCredentialsEngine;
  logger: Logger;
  messaging?: MessagingEngine;
  oauth?: OAuthLogin;
  customerOAuth?: OAuthLogin;
  operations?: OperationsEngine;
  payments?: PaymentsEngine;
  sessions: SessionAuthenticator;
  secureCookies: boolean;
  userAdmin?: UserAdminEngine;
  users: UserDirectory;
  version: string;
}

export const SESSION_COOKIE_NAME = 'verdeo_session';
export const SITE_SCOPE_HEADER = 'x-verdeo-site';
// Messages live 30 days (ADR-032); the runtime overrides this from configuration.
const DEFAULT_CHAT_RETENTION_DAYS = 30;

function statusForCode(code: ApiErrorCode): 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503 {
  const statuses: Record<ApiErrorCode, 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503> = {
    BAD_REQUEST: 400,
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    SERVICE_UNAVAILABLE: 503,
    INTERNAL_ERROR: 500,
  };
  return statuses[code];
}

export function createApp(options: CreateAppOptions) {
  const app = new Hono<{ Variables: AppVariables }>();
  const operations = options.operations;

  const requireOperations = () => {
    if (!operations) throw new Error('Operations engine is not configured');
    return operations;
  };

  const chat = options.chat;

  const requireChat = () => {
    if (!chat) throw new Error('Chat engine is not configured');
    return chat;
  };

  const chatContext = (context: Context<{ Variables: AppVariables }>): ChatContext => ({
    actorUserId: context.get('session').userId,
    correlationId: context.get('requestId'),
    requestId: context.get('requestId'),
    source: 'api',
  });

  const geography = options.geography;

  const requireGeography = () => {
    if (!geography) throw new Error('Geography engine is not configured');
    return geography;
  };

  const avatarStorage = options.avatarStorage;

  const requireAvatarStorage = () => {
    if (!avatarStorage) throw new Error('Avatar storage is not configured');
    return avatarStorage;
  };

  const userAdmin = options.userAdmin;

  const requireUserAdmin = () => {
    if (!userAdmin) throw new Error('User admin engine is not configured');
    return userAdmin;
  };

  const accessTokens = options.accessTokens;

  const requireAccessTokens = () => {
    if (!accessTokens) throw new Error('Access token engine is not configured');
    return accessTokens;
  };

  const cms = options.cms;

  const requireCms = () => {
    if (!cms) throw new Error('CMS engine is not configured');
    return cms;
  };

  const messaging = options.messaging;

  const requireMessaging = () => {
    if (!messaging) throw new Error('Messaging engine is not configured');
    return messaging;
  };

  const messagingContext = (context: Context<{ Variables: AppVariables }>): MessagingContext => ({
    actorUserId: context.get('session')?.userId,
    correlationId: context.get('requestId'),
    requestId: context.get('requestId'),
    source: 'api',
  });

  const delivery = options.delivery;

  const requireDelivery = () => {
    if (!delivery) throw new Error('Delivery engine is not configured');
    return delivery;
  };

  const deliveryContext = (context: Context<{ Variables: AppVariables }>): DeliveryContext => ({
    actorUserId: context.get('session')?.userId,
    correlationId: context.get('requestId'),
    requestId: context.get('requestId'),
    source: 'api',
  });

  const payments = options.payments;

  const requirePayments = () => {
    if (!payments) throw new Error('Payments engine is not configured');
    return payments;
  };

  const paymentsContext = (context: Context<{ Variables: AppVariables }>): PaymentsContext => ({
    actorUserId: context.get('session')?.userId,
    correlationId: context.get('requestId'),
    requestId: context.get('requestId'),
    source: 'api',
  });

  const auditQuery = options.auditQuery;

  const requireAuditQuery = () => {
    if (!auditQuery) throw new Error('Audit query engine is not configured');
    return auditQuery;
  };

  const surveys = options.surveys;

  const requireSurveys = () => {
    if (!surveys) throw new Error('Survey engine is not configured');
    return surveys;
  };

  const surveyContext = (context: Context<{ Variables: AppVariables }>): SurveyContext => ({
    actorUserId: context.get('session')?.userId,
    correlationId: context.get('requestId'),
    requestId: context.get('requestId'),
    source: 'api',
  });

  const help = options.help;

  const requireHelp = () => {
    if (!help) throw new Error('Help engine is not configured');
    return help;
  };

  const helpContext = (context: Context<{ Variables: AppVariables }>): HelpContext => ({
    actorUserId: context.get('session')?.userId,
    correlationId: context.get('requestId'),
    requestId: context.get('requestId'),
    source: 'api',
  });

  const aiPrompts = options.aiPrompts;

  const requireAiPrompts = () => {
    if (!aiPrompts) throw new Error('AI prompt engine is not configured');
    return aiPrompts;
  };

  const aiTasks = options.aiTasks;

  const requireAiTasks = () => {
    if (!aiTasks) throw new Error('AI task engine is not configured');
    return aiTasks;
  };

  const aiEngineContext = (
    context: Context<{ Variables: AppVariables }>,
  ): AIConfigurationContext => ({
    actorUserId: context.get('session').userId,
    correlationId: context.get('requestId'),
    requestId: context.get('requestId'),
    source: 'api',
  });

  // The client sends its selected operation, but membership is resolved server-side and intersected
  // with it. An operation the session cannot reach answers 403, never an empty list (ADR-031).
  const resolveScopeSelection = async (
    context: Context<{ Variables: AppVariables }>,
    next: () => Promise<void>,
  ) => {
    const session = context.get('session');
    const scope = await requireGeography().resolveScope(
      session.userId,
      session.permissions.includes('sites.access_all'),
    );
    const requested = context.req.header(SITE_SCOPE_HEADER)?.trim();

    if (!requested || requested.toLowerCase() === 'global') {
      // No explicit selection never widens access: global only for sessions allowed to use it,
      // otherwise the session's own default operation.
      context.set('scope', {
        operatingSiteId: scope.canSelectGlobal ? null : scope.defaultSiteId,
      });
      await next();
      return;
    }

    if (!scope.sites.some((site) => site.id === requested)) return forbidden(context);

    context.set('scope', { operatingSiteId: requested });
    await next();
  };

  const scoped = <T>(context: Context<{ Variables: AppVariables }>, input: T): ScopedInput<T> => ({
    ...input,
    operatingSiteId: context.get('scope')?.operatingSiteId ?? null,
  });

  const geographyContext = (context: Context<{ Variables: AppVariables }>): GeographyContext => ({
    actorUserId: context.get('session')?.userId,
    correlationId: context.get('requestId'),
    requestId: context.get('requestId'),
    source: 'api',
  });

  const cmsContext = (context: Context<{ Variables: AppVariables }>): CmsContext => ({
    actorUserId: context.get('session')?.userId,
    correlationId: context.get('requestId'),
    requestId: context.get('requestId'),
    source: 'api',
  });

  const operationsContext = (context: Context<{ Variables: AppVariables }>): OperationsContext => ({
    actorUserId: context.get('session')?.userId,
    correlationId: context.get('requestId'),
    requestId: context.get('requestId'),
    source: 'api',
  });

  const contractValue = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

  const setSessionCookie = (context: Context, login: LoginResult) => {
    setCookie(context, SESSION_COOKIE_NAME, login.token, {
      expires: login.expiresAt,
      httpOnly: true,
      path: '/',
      sameSite: options.cookieSameSite,
      secure: options.secureCookies || options.cookieSameSite === 'None',
    });
  };

  const forbidden = (context: Context<{ Variables: AppVariables }>) => {
    const code: ApiErrorCode = 'FORBIDDEN';
    return context.json(
      {
        error: {
          code,
          message: 'No tenés permiso para realizar esta acción.',
          requestId: context.get('requestId'),
        },
      },
      statusForCode(code),
    );
  };

  const badRequest = (
    context: Context<{ Variables: AppVariables }>,
    message: string,
    details?: unknown,
  ) => {
    const code: ApiErrorCode = 'BAD_REQUEST';
    return context.json(
      {
        error: {
          code,
          ...(details === undefined ? {} : { details }),
          message,
          requestId: context.get('requestId'),
        },
      },
      statusForCode(code),
    );
  };

  const requireAuthentication = async (
    context: Context<{ Variables: AppVariables }>,
    next: () => Promise<void>,
  ) => {
    const token = getCookie(context as Context, SESSION_COOKIE_NAME);
    const session = token ? await options.sessions.authenticate(token) : null;

    if (!session) {
      const code: ApiErrorCode = 'UNAUTHENTICATED';
      return context.json(
        {
          error: {
            code,
            message: 'Necesitás iniciar sesión.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    context.set('session', session);
    await next();
  };

  app.use('*', async (context, next) => {
    const startedAt = performance.now();
    const requestId = createRequestId(context.req.header('x-request-id'));
    const logger = options.logger.child({ requestId });

    context.set('requestId', requestId);
    context.set('logger', logger);
    context.header('x-request-id', requestId);

    await next();

    logger.info({
      duration: Math.round(performance.now() - startedAt),
      event: 'http.request.completed',
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
    });
  });
  app.use('*', cors({ origin: options.appOrigin, credentials: true }));

  app.get('/health', (context) => {
    const payload = HealthResponseSchema.parse({
      service: 'verdeo-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: options.version,
    });
    return context.json(payload);
  });

  app.get('/api/v1/config/public', (context) =>
    context.json({ locale: 'es-AR', productName: 'Verdeo SCA' }),
  );

  // Public site directory for the guest city selector. Names and slugs only: no contact data,
  // no counts, nothing an operator configured as internal.
  app.get('/api/v1/public/operating-sites', async (context) => {
    const sites = await requireGeography().listSites();
    const items = (sites as readonly { active: boolean; displayName: string; slug: string }[])
      .filter((site) => site.active)
      .map((site) => ({ displayName: site.displayName, slug: site.slug }));
    return context.json(PublicOperatingSiteListResponseSchema.parse({ items }));
  });

  // Zone picker for the "mi cuenta" saved-address form — a customer needs to name the same
  // mandatory operational anchor (ADR-031) staff addresses carry, without ever seeing the
  // staff-only fields (manager name, WhatsApp/phone overrides) a zone otherwise carries.
  app.get('/api/v1/public/operating-sites/:slug/zones', async (context) => {
    const slug = context.req.param('slug');
    const sites = (await requireGeography().listSites()) as readonly {
      active: boolean;
      id: string;
      slug: string;
    }[];
    const site = sites.find((candidate) => candidate.active && candidate.slug === slug);
    if (!site) {
      const code: ApiErrorCode = 'NOT_FOUND';
      return context.json(
        {
          error: { code, message: 'Operación no encontrada.', requestId: context.get('requestId') },
        },
        statusForCode(code),
      );
    }
    const zones = (await requireGeography().listZones(site.id)) as readonly {
      active: boolean;
      displayName: string;
      id: string;
    }[];
    return context.json({
      items: zones
        .filter((zone) => zone.active)
        .map((zone) => ({ displayName: zone.displayName, id: zone.id })),
    });
  });

  app.get('/api/v1/public/menu/current', async (context) => {
    // A visitor's city selects which published revision they see; without one, the global master.
    const requestedSlug = context.req.query('site')?.trim();
    const sites = requestedSlug
      ? ((await requireGeography().listSites()) as readonly {
          active: boolean;
          id: string;
          slug: string;
        }[])
      : [];
    const site = sites.find((candidate) => candidate.active && candidate.slug === requestedSlug);
    const menu = await requireOperations().currentPublishedMenu(site?.id ?? null);
    if (!menu) {
      const code: ApiErrorCode = 'NOT_FOUND';
      return context.json(
        {
          error: {
            code,
            message: 'Todavía no hay un menú semanal publicado.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    return context.json(MenuListResponseSchema.parse({ items: [contractValue(menu)] }).items[0]);
  });

  app.get('/api/v1/public/pages/:slug', async (context) => {
    const slug = context.req.param('slug');
    const page = await requireCms().getPublicPage(slug);
    if (!page) {
      const code: ApiErrorCode = 'NOT_FOUND';
      return context.json(
        { error: { code, message: 'Página no encontrada.', requestId: context.get('requestId') } },
        statusForCode(code),
      );
    }
    return context.json(PagePublicResponseSchema.parse(contractValue(page)));
  });

  app.post('/api/v1/public/orders', async (context) => {
    const input = PublicOrderCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Revisá los datos del pedido.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const requestId = context.get('requestId');
    const order = await requireOperations().createPublicOrder(input.data, {
      correlationId: requestId,
      requestId,
      source: 'public-web',
    });
    return context.json(OrderSchema.parse(contractValue(order)), 201);
  });

  // Public order tracking ("seguimiento" — CMS_AND_PUBLIC_WEB.md). A generic 404 covers both "no
  // such order" and "contact doesn't match", same anti-enumeration posture as the login endpoints.
  app.post('/api/v1/public/orders/track', async (context) => {
    const input = PublicOrderTrackRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Ingresá el número de pedido y el contacto usado al pedir.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const found = (await requireOperations().trackPublicOrder(
      input.data.publicNumber,
      input.data.contact,
    )) as {
      history: { createdAt: Date; toStatus: string }[];
      order: Record<string, unknown>;
    } | null;
    if (!found) {
      const code: ApiErrorCode = 'NOT_FOUND';
      return context.json(
        {
          error: {
            code,
            message: 'No encontramos un pedido con esos datos.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const payload = PublicOrderTrackResponseSchema.parse(
      contractValue({
        currency: found.order.currency,
        deliveryAddress: found.order.deliveryAddress,
        deliveryDate: found.order.deliveryDate,
        history: found.history.map((entry) => ({ at: entry.createdAt, status: entry.toStatus })),
        items: found.order.items,
        notes: found.order.notes,
        publicNumber: found.order.publicNumber,
        status: found.order.status,
        totalMinor: found.order.totalMinor,
      }),
    );
    return context.json(payload);
  });

  // Public survey, token-gated — an unknown token 404s, an already-used or deactivated one 409s
  // (SurveyNotFoundError / SurveyConflictError, translated by the shared error handler below).
  app.get('/api/v1/public/surveys/:token', async (context) => {
    const token = context.req.param('token');
    const survey = await requireSurveys().getPublicSurvey(token);
    return context.json(SurveyPublicSchema.parse(contractValue(survey)));
  });

  app.post('/api/v1/public/surveys/:token/submit', async (context) => {
    const token = context.req.param('token');
    const input = SurveySubmitRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) return badRequest(context, 'Revisá las respuestas.', input.error.issues);
    const response = await requireSurveys().submitSurveyResponse(token, input.data.answers);
    return context.json({ ok: Boolean(response) }, 201);
  });

  // Public customer OAuth: never shares a handler with the staff exchange below — this one
  // auto-provisions a customer account + CRM record on a first-time identity, the staff one
  // requires a pre-existing user and rejects everyone else.
  app.post('/api/v1/public/auth/oauth/exchange', async (context) => {
    const input = OAuthExchangeRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'La respuesta de autenticación no es válida.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    if (!options.customerOAuth) {
      const code: ApiErrorCode = 'SERVICE_UNAVAILABLE';
      return context.json(
        {
          error: {
            code,
            message: 'El acceso con Google todavía no está disponible.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    const login = await options.customerOAuth.exchange(
      input.data.accessToken,
      context.get('requestId'),
    );
    if (!login) {
      const code: ApiErrorCode = 'UNAUTHENTICATED';
      return context.json(
        {
          error: {
            code,
            message: 'No pudimos verificar tu cuenta de Google.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    setSessionCookie(context, login);
    context.header('cache-control', 'no-store');

    return context.json(
      LoginResponseSchema.parse({
        expiresAt: login.expiresAt.toISOString(),
        sessionId: login.sessionId,
      }),
    );
  });

  app.post('/api/v1/auth/login', async (context) => {
    const input = LoginRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Revisá el email y la contraseña.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    const login = await options.credentials.login(
      input.data.email,
      input.data.password,
      context.get('requestId'),
    );
    if (!login) {
      const code: ApiErrorCode = 'UNAUTHENTICATED';
      return context.json(
        {
          error: {
            code,
            message: 'El email o la contraseña no son válidos.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    setSessionCookie(context, login);

    const payload = LoginResponseSchema.parse({
      expiresAt: login.expiresAt.toISOString(),
      sessionId: login.sessionId,
    });
    return context.json(payload);
  });

  // "Acceder con token": no password, a repartidor pastes the token a superadmin generated for
  // them. A generic error covers every failure reason (invalid, expired, revoked, already used) —
  // same "don't help an attacker narrow it down" posture as the password login above.
  app.post('/api/v1/auth/token-login', async (context) => {
    const input = AccessTokenRedeemRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Revisá el token ingresado.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    const outcome = await requireAccessTokens().redeem(input.data.token, input.data.displayName);
    if (!outcome.ok || !outcome.session) {
      const code: ApiErrorCode = 'UNAUTHENTICATED';
      return context.json(
        {
          error: {
            code,
            message:
              outcome.reason === 'display_name_required'
                ? 'Ingresá tu nombre para crear la cuenta.'
                : 'El token no es válido, expiró o ya fue usado.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    setSessionCookie(context, outcome.session);
    const payload = LoginResponseSchema.parse({
      expiresAt: outcome.session.expiresAt.toISOString(),
      sessionId: outcome.session.sessionId,
    });
    return context.json(payload);
  });

  app.post('/api/v1/auth/oauth/exchange', async (context) => {
    const input = OAuthExchangeRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'La respuesta de autenticación no es válida.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    if (!options.oauth) {
      const code: ApiErrorCode = 'SERVICE_UNAVAILABLE';
      return context.json(
        {
          error: {
            code,
            message: 'El acceso con Google todavía no está disponible.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    const login = await options.oauth.exchange(input.data.accessToken, context.get('requestId'));
    if (!login) {
      const code: ApiErrorCode = 'UNAUTHENTICATED';
      return context.json(
        {
          error: {
            code,
            message: 'Esta cuenta no tiene acceso habilitado en Verdeo.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    setSessionCookie(context, login);
    context.header('cache-control', 'no-store');

    return context.json(
      LoginResponseSchema.parse({
        expiresAt: login.expiresAt.toISOString(),
        sessionId: login.sessionId,
      }),
    );
  });

  app.use('/api/v1/me', requireAuthentication);
  app.use('/api/v1/me/*', requireAuthentication);
  app.use('/api/v1/sessions', requireAuthentication);
  app.use('/api/v1/sessions/*', requireAuthentication);
  app.use('/api/v1/users', requireAuthentication, requirePermission('users.read'));
  app.use('/api/v1/users/*', requireAuthentication);
  app.use('/api/v1/roles', requireAuthentication);
  app.use('/api/v1/permissions', requireAuthentication);
  app.use('/api/v1/access-tokens', requireAuthentication);
  app.use('/api/v1/cms/*', requireAuthentication);
  app.use('/api/v1/messaging/*', requireAuthentication);
  app.use('/api/v1/delivery/*', requireAuthentication);
  app.use('/api/v1/payments/*', requireAuthentication);
  app.use('/api/v1/stats', requireAuthentication);
  app.use('/api/v1/access-tokens/*', requireAuthentication);
  app.use('/api/v1/scope', requireAuthentication);
  app.use('/api/v1/operating-sites', requireAuthentication);
  app.use('/api/v1/operating-sites/*', requireAuthentication);
  app.use('/api/v1/zones', requireAuthentication, resolveScopeSelection);
  app.use('/api/v1/zones/*', requireAuthentication);
  app.use('/api/v1/chat', requireAuthentication);
  app.use('/api/v1/chat/*', requireAuthentication);
  app.use('/api/v1/customers', requireAuthentication, resolveScopeSelection);
  app.use('/api/v1/customers/*', requireAuthentication, resolveScopeSelection);
  app.use('/api/v1/message-templates', requireAuthentication);
  app.use('/api/v1/menus', requireAuthentication);
  app.use('/api/v1/menus/*', requireAuthentication);
  app.use('/api/v1/orders', requireAuthentication, resolveScopeSelection);
  app.use('/api/v1/orders/*', requireAuthentication, resolveScopeSelection);
  app.use('/api/v1/production/*', requireAuthentication, resolveScopeSelection);
  app.use('/api/v1/surplus/*', requireAuthentication);
  app.use('/api/v1/menu-catalog/*', requireAuthentication);
  app.use('/api/v1/ai/providers', requireAuthentication);
  app.use('/api/v1/integrations/credentials', requireAuthentication);
  app.use('/api/v1/ai/prompts', requireAuthentication);
  app.use('/api/v1/ai/prompts/*', requireAuthentication);
  app.use('/api/v1/audit', requireAuthentication);
  app.use('/api/v1/audit/*', requireAuthentication);
  app.use('/api/v1/label-settings', requireAuthentication);
  app.use('/api/v1/label-settings/*', requireAuthentication);
  app.use('/api/v1/surveys', requireAuthentication);
  app.use('/api/v1/surveys/*', requireAuthentication);
  app.use('/api/v1/help', requireAuthentication);
  app.use('/api/v1/help/*', requireAuthentication);
  app.use('/api/v1/ai/tasks/*', requireAuthentication);

  app.get('/api/v1/me', async (context) => {
    const session = context.get('session');
    const user = await options.users.findProfileById(session.userId);
    if (!user) throw new Error(`Authenticated user not found: ${session.userId}`);
    const payload = MeResponseSchema.parse({
      permissions: [...session.permissions].sort(),
      session: {
        expiresAt: session.expiresAt.toISOString(),
        id: session.sessionId,
      },
      user: {
        avatarUrl: user.avatarUrl,
        displayName: user.displayName,
        email: user.email,
        id: session.userId,
      },
    });

    return context.json(payload);
  });

  // Self-service only: editing your own display name needs authentication, not a permission — it
  // is not the admin user-management surface (which does not exist yet).
  app.patch('/api/v1/me', async (context) => {
    const session = context.get('session');
    const input = ProfileUpdateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success)
      return badRequest(context, 'Revisá el nombre a mostrar.', input.error.issues);
    const user = await options.users.updateProfile(session.userId, input.data);
    const payload = MeResponseSchema.shape.user.parse({
      avatarUrl: user.avatarUrl,
      displayName: user.displayName,
      email: user.email,
      id: user.id,
    });
    return context.json(payload);
  });

  const AVATAR_ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

  app.post('/api/v1/me/avatar', async (context) => {
    const session = context.get('session');
    const contentType = context.req.header('content-type') ?? '';
    if (!AVATAR_ALLOWED_CONTENT_TYPES.has(contentType))
      return badRequest(context, 'La imagen debe ser JPEG, PNG o WebP.');
    const bytes = new Uint8Array(await context.req.arrayBuffer());
    if (bytes.byteLength === 0) return badRequest(context, 'El archivo está vacío.');
    if (bytes.byteLength > AVATAR_MAX_BYTES)
      return badRequest(context, 'La imagen no puede superar los 5 MB.');

    const { url } = await requireAvatarStorage().upload(session.userId, bytes, contentType);
    const user = await options.users.updateProfile(session.userId, { avatarUrl: url });
    const payload = MeResponseSchema.shape.user.parse({
      avatarUrl: user.avatarUrl,
      displayName: user.displayName,
      email: user.email,
      id: user.id,
    });
    return context.json(payload);
  });

  // Customer self-service ("mi cuenta"): gated by holding a customer-linked session
  // (session.customerId), never by an RBAC permission — a colaborador session has no
  // customerId and 403s here regardless of what staff permissions it holds, and a customer
  // session's `cliente` role permissions (if any) are irrelevant to these routes.
  const requireCustomerSession = (context: Context<{ Variables: AppVariables }>) => {
    const customerId = context.get('session').customerId;
    if (!customerId) return null;
    return customerId;
  };

  app.get('/api/v1/me/customer', async (context) => {
    const customerId = requireCustomerSession(context);
    if (!customerId) return forbidden(context);
    const customer = await requireOperations().getCustomer(customerId, true);
    return context.json(CustomerSelfServiceSchema.parse(contractValue(customer)));
  });

  app.get('/api/v1/me/orders', async (context) => {
    const customerId = requireCustomerSession(context);
    if (!customerId) return forbidden(context);
    const query = OrderListQuerySchema.safeParse(context.req.query());
    if (!query.success)
      return badRequest(context, 'Los filtros de pedidos no son válidos.', query.error.issues);
    const page = await requireOperations().listOrders({
      ...query.data,
      customerId,
      operatingSiteId: null,
    });
    return context.json(OrderPageResponseSchema.parse(contractValue(page)));
  });

  app.post('/api/v1/me/addresses', async (context) => {
    const customerId = requireCustomerSession(context);
    if (!customerId) return forbidden(context);
    const input = CustomerAddressCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) return badRequest(context, 'Revisá el domicilio.', input.error.issues);
    const address = await requireOperations().addCustomerAddress(
      customerId,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerAddressSchema.parse(contractValue(address)), 201);
  });

  app.patch('/api/v1/me/addresses/:addressId', async (context) => {
    const customerId = requireCustomerSession(context);
    if (!customerId) return forbidden(context);
    const addressId = context.req.param('addressId');
    const input = CustomerAddressUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá los cambios del domicilio.', input.error.issues);
    const address = await requireOperations().updateCustomerAddress(
      customerId,
      addressId,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerAddressSchema.parse(contractValue(address)));
  });

  app.post('/api/v1/auth/logout', async (context) => {
    const token = getCookie(context as Context, SESSION_COOKIE_NAME);

    if (token) {
      const session = await options.sessions.authenticate(token);
      if (session) await options.sessions.revoke(session, context.get('requestId'));
    }

    deleteCookie(context, SESSION_COOKIE_NAME, {
      httpOnly: true,
      path: '/',
      sameSite: options.cookieSameSite,
      secure: options.secureCookies || options.cookieSameSite === 'None',
    });

    return context.body(null, 204);
  });

  app.get('/api/v1/sessions', async (context) => {
    const currentSession = context.get('session');
    const sessionRows = await options.sessions.listForUser(currentSession.userId);
    const payload = SessionListResponseSchema.parse({
      items: sessionRows.map((session) => ({
        createdAt: session.createdAt.toISOString(),
        current: session.id === currentSession.sessionId,
        expiresAt: session.expiresAt.toISOString(),
        id: session.id,
        lastSeenAt: session.lastSeenAt.toISOString(),
        revokedAt: session.revokedAt?.toISOString() ?? null,
      })),
    });

    return context.json(payload);
  });

  app.delete('/api/v1/sessions/:id', async (context) => {
    const params = SessionIdParamSchema.safeParse(context.req.param());
    if (!params.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: params.error.issues,
            message: 'El identificador de sesión no es válido.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    const currentSession = context.get('session');
    const revoked = await options.sessions.revokeOwned(
      currentSession,
      params.data.id,
      context.get('requestId'),
    );

    if (!revoked) {
      const code: ApiErrorCode = 'NOT_FOUND';
      return context.json(
        {
          error: {
            code,
            message: 'La sesión solicitada no existe.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    if (params.data.id === currentSession.sessionId) {
      deleteCookie(context, SESSION_COOKIE_NAME, {
        httpOnly: true,
        path: '/',
        sameSite: options.cookieSameSite,
        secure: options.secureCookies || options.cookieSameSite === 'None',
      });
    }

    return context.body(null, 204);
  });

  app.get('/api/v1/users', async (context) => {
    const query = UserListQuerySchema.safeParse(context.req.query());
    if (!query.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: query.error.issues,
            message: 'Los parámetros de paginación no son válidos.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    const page = await options.users.list(query.data.cursor, query.data.limit);
    const payload = UserListResponseSchema.parse({
      items: page.items.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    });

    return context.json(payload);
  });

  app.get('/api/v1/users/:id', async (context) => {
    if (!context.get('session').permissions.includes('users.read')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El usuario indicado no es válido.');
    const detail = await requireUserAdmin().getDetail(params.data.id);
    if (!detail) {
      const code: ApiErrorCode = 'NOT_FOUND';
      return context.json(
        { error: { code, message: 'Usuario no encontrado.', requestId: context.get('requestId') } },
        statusForCode(code),
      );
    }
    return context.json(UserAdminDetailSchema.parse(contractValue(detail)));
  });

  app.get('/api/v1/roles', async (context) => {
    if (!context.get('session').permissions.includes('users.read')) return forbidden(context);
    const items = await requireUserAdmin().listRoles();
    return context.json(RoleListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/permissions', async (context) => {
    if (!context.get('session').permissions.includes('users.read')) return forbidden(context);
    const items = await requireUserAdmin().listPermissionsCatalog();
    return context.json(PermissionCatalogResponseSchema.parse({ items: contractValue(items) }));
  });

  app.patch('/api/v1/users/:id/status', async (context) => {
    if (!context.get('session').permissions.includes('users.disable')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = UserStatusUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(context, 'Revisá el estado del usuario.');
    const detail = await requireUserAdmin().setStatus(params.data.id, input.data.active);
    return context.json(UserAdminDetailSchema.parse(contractValue(detail)));
  });

  app.put('/api/v1/users/:id/roles', async (context) => {
    if (!context.get('session').permissions.includes('roles.manage')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = UserRolesUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(context, 'Revisá los roles seleccionados.');
    const detail = await requireUserAdmin().setRoles(
      params.data.id,
      input.data.roleIds,
      context.get('session').userId,
    );
    return context.json(UserAdminDetailSchema.parse(contractValue(detail)));
  });

  app.put('/api/v1/users/:id/permissions', async (context) => {
    if (!context.get('session').permissions.includes('permissions.override'))
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = UserPermissionOverridesUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(context, 'Revisá las excepciones de permisos.');
    const detail = await requireUserAdmin().setPermissionOverrides(
      params.data.id,
      input.data.overrides,
      context.get('session').userId,
    );
    return context.json(UserAdminDetailSchema.parse(contractValue(detail)));
  });

  app.get('/api/v1/access-tokens', async (context) => {
    if (!context.get('session').permissions.includes('access_tokens.manage'))
      return forbidden(context);
    const operatingSiteId = context.req.query('operatingSiteId') ?? undefined;
    const items = await requireAccessTokens().list(operatingSiteId);
    return context.json(AccessTokenListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/access-tokens', async (context) => {
    if (!context.get('session').permissions.includes('access_tokens.manage'))
      return forbidden(context);
    const input = AccessTokenIssueRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá los datos del token.', input.error.issues);
    const issued = await requireAccessTokens().issue(input.data, context.get('session').userId);
    return context.json(AccessTokenIssuedResponseSchema.parse(contractValue(issued)), 201);
  });

  app.delete('/api/v1/access-tokens/:id', async (context) => {
    if (!context.get('session').permissions.includes('access_tokens.manage'))
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El token indicado no es válido.');
    await requireAccessTokens().revoke(params.data.id);
    return context.body(null, 204);
  });

  app.get('/api/v1/cms/pages', async (context) => {
    if (!context.get('session').permissions.includes('cms.read')) return forbidden(context);
    const items = await requireCms().listPages();
    return context.json(PageListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/cms/pages', async (context) => {
    if (!context.get('session').permissions.includes('cms.edit')) return forbidden(context);
    const input = PageCreateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success)
      return badRequest(context, 'Revisá el slug y el título de la página.', input.error.issues);
    try {
      const page = await requireCms().createPage(input.data, cmsContext(context));
      return context.json(PageDetailSchema.parse(contractValue(page)), 201);
    } catch (error) {
      if (error instanceof Error && error.name === 'CmsConflictError') {
        const code: ApiErrorCode = 'CONFLICT';
        return context.json(
          { error: { code, message: error.message, requestId: context.get('requestId') } },
          statusForCode(code),
        );
      }
      throw error;
    }
  });

  app.get('/api/v1/cms/pages/:slug', async (context) => {
    if (!context.get('session').permissions.includes('cms.read')) return forbidden(context);
    const slug = context.req.param('slug');
    const page = await requireCms().getPageDetail(slug);
    if (!page) {
      const code: ApiErrorCode = 'NOT_FOUND';
      return context.json(
        { error: { code, message: 'Página no encontrada.', requestId: context.get('requestId') } },
        statusForCode(code),
      );
    }
    return context.json(PageDetailSchema.parse(contractValue(page)));
  });

  app.get('/api/v1/cms/pages/:slug/revisions', async (context) => {
    if (!context.get('session').permissions.includes('cms.read')) return forbidden(context);
    const slug = context.req.param('slug');
    const items = await requireCms().listRevisions(slug);
    return context.json(PageRevisionListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.put('/api/v1/cms/pages/:slug/draft', async (context) => {
    if (!context.get('session').permissions.includes('cms.edit')) return forbidden(context);
    const slug = context.req.param('slug');
    const input = PageDraftUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá las secciones de la página.', input.error.issues);
    const revision = await requireCms().saveDraft(slug, input.data.sections, cmsContext(context));
    return context.json(PageRevisionSchema.parse(contractValue(revision)));
  });

  app.post('/api/v1/cms/pages/:slug/publish', async (context) => {
    if (!context.get('session').permissions.includes('cms.publish')) return forbidden(context);
    const slug = context.req.param('slug');
    const input = PagePublishRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) return badRequest(context, 'Indicá la revisión a publicar.');
    const page = await requireCms().publish(slug, input.data.revisionId, cmsContext(context));
    return context.json(PageDetailSchema.parse(contractValue(page)));
  });

  app.get('/api/v1/cms/media', async (context) => {
    if (!context.get('session').permissions.includes('cms.read')) return forbidden(context);
    const items = await requireCms().listMediaAssets();
    return context.json(MediaAssetListResponseSchema.parse({ items: contractValue(items) }));
  });

  const MEDIA_ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const MEDIA_MAX_BYTES = 8 * 1024 * 1024;

  app.post('/api/v1/cms/media', async (context) => {
    if (!context.get('session').permissions.includes('cms.edit')) return forbidden(context);
    const contentType = context.req.header('content-type') ?? '';
    if (!MEDIA_ALLOWED_CONTENT_TYPES.has(contentType))
      return badRequest(context, 'La imagen debe ser JPEG, PNG o WebP.');
    const bytes = new Uint8Array(await context.req.arrayBuffer());
    if (bytes.byteLength === 0) return badRequest(context, 'El archivo está vacío.');
    if (bytes.byteLength > MEDIA_MAX_BYTES)
      return badRequest(context, 'La imagen no puede superar los 8 MB.');

    const { url } = await requireAvatarStorage().uploadMedia(bytes, contentType);
    const asset = await requireCms().recordMediaAsset(
      { contentType, label: context.req.query('label'), url },
      context.get('session').userId,
    );
    return context.json(MediaAssetSchema.parse(contractValue(asset)), 201);
  });

  app.get('/api/v1/scope', async (context) => {
    const session = context.get('session');
    const scope = await requireGeography().resolveScope(
      session.userId,
      session.permissions.includes('sites.access_all'),
    );
    return context.json(ScopeResponseSchema.parse(contractValue(scope)));
  });

  // Zones of the active scope, for any screen that must attach an address to one.
  app.get('/api/v1/zones', async (context) => {
    const items = await requireGeography().listActiveZones(
      context.get('scope')?.operatingSiteId ?? null,
    );
    return context.json(GeographicZoneListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/operating-sites', requirePermission('sites.read'), async (context) => {
    const items = await requireGeography().listSites();
    return context.json(OperatingSiteListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/operating-sites', requirePermission('sites.manage'), async (context) => {
    const input = OperatingSiteCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá los datos de la operación.', input.error.issues);
    const site = await requireGeography().createSite(input.data, geographyContext(context));
    return context.json(OperatingSiteSchema.parse(contractValue(site)), 201);
  });

  app.patch('/api/v1/operating-sites/:id', requirePermission('sites.manage'), async (context) => {
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'Identificador inválido.', params.error.issues);
    const input = OperatingSiteUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá los datos de la operación.', input.error.issues);
    const site = await requireGeography().updateSite(
      params.data.id,
      input.data,
      geographyContext(context),
    );
    return context.json(OperatingSiteSchema.parse(contractValue(site)));
  });

  app.get('/api/v1/operating-sites/:id/zones', requirePermission('sites.read'), async (context) => {
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'Identificador inválido.', params.error.issues);
    const items = await requireGeography().listZones(params.data.id);
    return context.json(GeographicZoneListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post(
    '/api/v1/operating-sites/:id/zones',
    requirePermission('zones.manage'),
    async (context) => {
      const params = IdParamSchema.safeParse(context.req.param());
      if (!params.success)
        return badRequest(context, 'Identificador inválido.', params.error.issues);
      const input = GeographicZoneCreateRequestSchema.safeParse({
        ...((await context.req.json().catch(() => null)) ?? {}),
        operatingSiteId: params.data.id,
      });
      if (!input.success)
        return badRequest(context, 'Revisá los datos de la zona.', input.error.issues);
      const zone = await requireGeography().createZone(input.data, geographyContext(context));
      return context.json(GeographicZoneSchema.parse(contractValue(zone)), 201);
    },
  );

  app.patch('/api/v1/zones/:id', requirePermission('zones.manage'), async (context) => {
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'Identificador inválido.', params.error.issues);
    const input = GeographicZoneUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá los datos de la zona.', input.error.issues);
    const zone = await requireGeography().updateZone(
      params.data.id,
      input.data,
      geographyContext(context),
    );
    return context.json(GeographicZoneSchema.parse(contractValue(zone)));
  });

  // ---- Internal staff messaging (ADR-032). Separate from the customer channel above. ----

  app.get('/api/v1/chat/links', requirePermission('chat.links.manage'), async (context) => {
    const links = await requireChat().listLinks();
    return context.json(ChatLinksResponseSchema.parse(contractValue(links)));
  });

  app.put('/api/v1/chat/links/roles', requirePermission('chat.links.manage'), async (context) => {
    const input = ChatRoleLinkRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success)
      return badRequest(context, 'Revisá el enlace de roles.', input.error.issues);
    await requireChat().setRoleLink(input.data, chatContext(context));
    return context.json(
      ChatLinksResponseSchema.parse(contractValue(await requireChat().listLinks())),
    );
  });

  app.put('/api/v1/chat/links/users', requirePermission('chat.links.manage'), async (context) => {
    const input = ChatUserLinkRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) return badRequest(context, 'Revisá la excepción.', input.error.issues);
    await requireChat().setUserLink(input.data, chatContext(context));
    return context.json(
      ChatLinksResponseSchema.parse(contractValue(await requireChat().listLinks())),
    );
  });

  app.delete(
    '/api/v1/chat/links/users/:id',
    requirePermission('chat.links.manage'),
    async (context) => {
      const params = IdParamSchema.safeParse(context.req.param());
      if (!params.success)
        return badRequest(context, 'Identificador inválido.', params.error.issues);
      await requireChat().removeUserLink(params.data.id, chatContext(context));
      return context.body(null, 204);
    },
  );

  app.get('/api/v1/chat/contacts', requirePermission('chat.use'), async (context) => {
    const items = await requireChat().listContacts(context.get('session').userId);
    return context.json(ChatContactListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/chat/presence/statuses', requirePermission('chat.use'), async (context) => {
    const items = await requireChat().listPresenceStatuses();
    return context.json(
      ChatPresenceStatusListResponseSchema.parse({ items: contractValue(items) }),
    );
  });

  app.post('/api/v1/chat/presence/heartbeat', requirePermission('chat.use'), async (context) => {
    const input = ChatHeartbeatRequestSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!input.success) return badRequest(context, 'Estado inválido.', input.error.issues);
    // The user is the session's: presence cannot be asserted on someone else's behalf.
    const presence = await requireChat().heartbeat(
      context.get('session').userId,
      input.data.status,
    );
    return context.json(ChatPresenceEntrySchema.parse(contractValue(presence)));
  });

  app.get('/api/v1/chat/presence', requirePermission('chat.presence.read'), async (context) => {
    const items = await requireChat().listPresence(context.get('session').userId);
    return context.json(ChatPresenceListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/chat/conversations', requirePermission('chat.use'), async (context) => {
    const items = await requireChat().listConversations(context.get('session').userId);
    return context.json(ChatConversationListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/chat/conversations', requirePermission('chat.use'), async (context) => {
    const input = ChatConversationOpenRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) return badRequest(context, 'Elegí una persona válida.', input.error.issues);
    const conversation = await requireChat().openDirectConversation(
      input.data.userId,
      chatContext(context),
    );
    return context.json(contractValue(conversation), 201);
  });

  app.get(
    '/api/v1/chat/conversations/:conversationId/messages',
    requirePermission('chat.use'),
    async (context) => {
      const params = ChatConversationParamSchema.safeParse(context.req.param());
      if (!params.success)
        return badRequest(context, 'Conversación inválida.', params.error.issues);
      const query = ChatMessageQuerySchema.safeParse(context.req.query());
      if (!query.success) return badRequest(context, 'Filtros inválidos.', query.error.issues);
      const items = await requireChat().listMessages(
        params.data.conversationId,
        context.get('session').userId,
        query.data,
      );
      return context.json(ChatMessageListResponseSchema.parse({ items: contractValue(items) }));
    },
  );

  app.post(
    '/api/v1/chat/conversations/:conversationId/messages',
    requirePermission('chat.use'),
    async (context) => {
      const params = ChatConversationParamSchema.safeParse(context.req.param());
      if (!params.success)
        return badRequest(context, 'Conversación inválida.', params.error.issues);
      const input = ChatMessageCreateRequestSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!input.success) return badRequest(context, 'Escribí un mensaje.', input.error.issues);
      const message = await requireChat().sendMessage(
        params.data.conversationId,
        input.data.body,
        chatContext(context),
      );
      return context.json(ChatMessageSchema.parse(contractValue(message)), 201);
    },
  );

  app.post(
    '/api/v1/chat/conversations/:conversationId/locations',
    requirePermission('chat.use'),
    async (context) => {
      const params = ChatConversationParamSchema.safeParse(context.req.param());
      if (!params.success)
        return badRequest(context, 'Conversación inválida.', params.error.issues);
      const input = ChatLocationCreateRequestSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!input.success) return badRequest(context, 'Ubicación inválida.', input.error.issues);
      const message = await requireChat().sendLocation(
        params.data.conversationId,
        input.data,
        chatContext(context),
      );
      return context.json(ChatMessageSchema.parse(contractValue(message)), 201);
    },
  );

  // Sharing a customer or order reference needs its own grant: a user may hold chat.use without
  // being able to point colleagues at customer records (ADR-032).
  app.post(
    '/api/v1/chat/conversations/:conversationId/references',
    requirePermission('chat.share_reference'),
    async (context) => {
      const params = ChatConversationParamSchema.safeParse(context.req.param());
      if (!params.success)
        return badRequest(context, 'Conversación inválida.', params.error.issues);
      const input = ChatReferenceCreateRequestSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!input.success) return badRequest(context, 'Referencia inválida.', input.error.issues);
      const message = await requireChat().sendReference(
        params.data.conversationId,
        input.data,
        chatContext(context),
      );
      return context.json(ChatMessageSchema.parse(contractValue(message)), 201);
    },
  );

  app.post(
    '/api/v1/chat/conversations/:conversationId/read',
    requirePermission('chat.use'),
    async (context) => {
      const params = ChatConversationParamSchema.safeParse(context.req.param());
      if (!params.success)
        return badRequest(context, 'Conversación inválida.', params.error.issues);
      await requireChat().markRead(params.data.conversationId, context.get('session').userId);
      return context.body(null, 204);
    },
  );

  // Scheduled retention. Authenticated by a shared secret rather than a session: no person triggers
  // it. With no secret configured the endpoint refuses everyone, which is the safe direction.
  app.post('/api/v1/cron/chat-retention', async (context) => {
    const provided = context.req.header('authorization');
    if (!options.cronSecret || provided !== `Bearer ${options.cronSecret}`)
      return forbidden(context);
    const result = await requireChat().purgeExpiredMessages(
      options.chatRetentionDays ?? DEFAULT_CHAT_RETENTION_DAYS,
      {
        actorUserId: 'system',
        correlationId: context.get('requestId'),
        requestId: context.get('requestId'),
        source: 'cron',
      },
    );
    return context.json(ChatPurgeResponseSchema.parse(contractValue(result)));
  });

  app.get('/api/v1/customers', async (context) => {
    const session = context.get('session');
    if (!session.permissions.includes('customers.read')) return forbidden(context);
    const query = CustomerListQuerySchema.safeParse(context.req.query());
    if (!query.success)
      return badRequest(context, 'Los filtros de clientes no son válidos.', query.error.issues);
    const page = await requireOperations().listCustomers(
      scoped(context, query.data),
      session.permissions.includes('customers.view_sensitive'),
    );
    return context.json(CustomerListResponseSchema.parse(contractValue(page)));
  });

  /** The column catalog the export picker renders from — never a hardcoded list in the dashboard. */
  app.get('/api/v1/customers/export/columns', (context) => {
    if (!context.get('session').permissions.includes('customers.read')) return forbidden(context);
    return context.json({
      defaults: DEFAULT_CUSTOMER_EXPORT_COLUMNS,
      items: CUSTOMER_EXPORT_COLUMN_CATALOG,
    });
  });

  app.get('/api/v1/customers/export', async (context) => {
    const session = context.get('session');
    if (!session.permissions.includes('customers.read')) return forbidden(context);
    const query = CustomerExportQuerySchema.safeParse(context.req.query());
    if (!query.success)
      return badRequest(context, 'Los filtros de exportación no son válidos.', query.error.issues);

    // Internal notes are staff annotation about the customer, so exporting them needs the same
    // gate that shows them on screen.
    const requested = query.data.columns
      ? query.data.columns.split(',').map((value) => value.trim())
      : DEFAULT_CUSTOMER_EXPORT_COLUMNS;
    const columns = session.permissions.includes('customers.view_sensitive')
      ? requested
      : requested.filter((key) => key !== 'internalNotes');

    const rows = await requireOperations().exportCustomers(
      scoped(context, {
        ...(query.data.search ? { search: query.data.search } : {}),
        ...(query.data.status ? { status: query.data.status } : {}),
      }),
      operationsContext(context),
    );
    const workbook = buildCustomersExcel(rows, columns);
    context.header('cache-control', 'private, no-store');
    context.header('content-disposition', 'attachment; filename="verdeo-clientes.xlsx"');
    context.header(
      'content-type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return context.body(workbook as unknown as ArrayBuffer);
  });

  app.post('/api/v1/customers', async (context) => {
    if (!context.get('session').permissions.includes('customers.create')) return forbidden(context);
    const input = CustomerCreateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Revisá los datos del cliente.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const customer = await requireOperations().createCustomer(
      scoped(context, input.data),
      operationsContext(context),
    );
    return context.json(
      CustomerListResponseSchema.parse({ items: [contractValue(customer)], nextCursor: null })
        .items[0],
      201,
    );
  });

  app.post('/api/v1/customers/import', async (context) => {
    if (!context.get('session').permissions.includes('customers.create')) return forbidden(context);
    const body = await context.req.parseBody().catch(() => null);
    const file = body?.file;
    if (!(file instanceof File)) {
      return badRequest(context, 'Adjuntá un archivo CSV o Excel (.xlsx) en el campo file.');
    }
    try {
      const zoneField = body?.geographicZoneId;
      const customers = await parseContactImport(
        file,
        typeof zoneField === 'string' && zoneField ? zoneField : undefined,
      );
      const operations = requireOperations();
      if (!operations.importCustomers) throw new Error('Customer import is not configured');
      await operations.importCustomers(
        customers.map((customer) => scoped(context, customer)),
        {
          ...operationsContext(context),
          source: 'spreadsheet_import',
        },
      );
      return context.json(CustomerImportResponseSchema.parse({ imported: customers.length }), 201);
    } catch (error) {
      if (error instanceof ContactImportError) {
        return badRequest(context, error.message, error.details);
      }
      throw error;
    }
  });

  app.get('/api/v1/customers/:id', async (context) => {
    const session = context.get('session');
    if (!session.permissions.includes('customers.read')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El cliente indicado no es válido.');
    const customer = await requireOperations().getCustomer(
      params.data.id,
      session.permissions.includes('customers.view_sensitive'),
    );
    return context.json(CustomerDetailSchema.parse(contractValue(customer)));
  });

  app.patch('/api/v1/customers/:id', async (context) => {
    const session = context.get('session');
    if (!session.permissions.includes('customers.edit')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = CustomerUpdateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los cambios del cliente.',
        input.success ? undefined : input.error.issues,
      );
    const customer = await requireOperations().updateCustomer(
      params.data.id,
      input.data,
      session.permissions.includes('customers.view_sensitive'),
      operationsContext(context),
    );
    return context.json(CustomerDetailSchema.parse(contractValue(customer)));
  });

  app.post('/api/v1/customers/:id/identities', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.edit') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = CustomerIdentityCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los datos de contacto.',
        input.success ? undefined : input.error.issues,
      );
    const identity = await requireOperations().addCustomerIdentity(
      params.data.id,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerIdentitySchema.parse(contractValue(identity)), 201);
  });

  app.patch('/api/v1/customers/:customerId/identities/:relationId', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.edit') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = CustomerRelationParamSchema.safeParse(context.req.param());
    const input = CustomerIdentityUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los cambios del contacto.',
        input.success ? undefined : input.error.issues,
      );
    const identity = await requireOperations().updateCustomerIdentity(
      params.data.customerId,
      params.data.relationId,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerIdentitySchema.parse(contractValue(identity)));
  });

  app.post('/api/v1/customers/:id/addresses', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.edit') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = CustomerAddressCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá el domicilio.',
        input.success ? undefined : input.error.issues,
      );
    const address = await requireOperations().addCustomerAddress(
      params.data.id,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerAddressSchema.parse(contractValue(address)), 201);
  });

  app.patch('/api/v1/customers/:customerId/addresses/:relationId', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.edit') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = CustomerRelationParamSchema.safeParse(context.req.param());
    const input = CustomerAddressUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los cambios del domicilio.',
        input.success ? undefined : input.error.issues,
      );
    const address = await requireOperations().updateCustomerAddress(
      params.data.customerId,
      params.data.relationId,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerAddressSchema.parse(contractValue(address)));
  });

  app.post('/api/v1/customers/:customerId/addresses/:addressId/geocoding', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.edit') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = CustomerAddressParamSchema.safeParse(context.req.param());
    const input = AddressGeocodingCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá la solicitud de geocodificación.',
        input.success ? undefined : input.error.issues,
      );
    const request = await requireOperations().requestAddressGeocoding(
      params.data.customerId,
      params.data.addressId,
      input.data,
      operationsContext(context),
    );
    return context.json(AddressGeocodingRequestSchema.parse(contractValue(request)), 201);
  });

  app.get(
    '/api/v1/customers/:customerId/addresses/:addressId/geocoding/:requestId',
    async (context) => {
      const permissions = context.get('session').permissions;
      if (
        !permissions.includes('customers.read') ||
        !permissions.includes('customers.view_sensitive')
      )
        return forbidden(context);
      const params = AddressGeocodingParamSchema.safeParse(context.req.param());
      if (!params.success)
        return badRequest(context, 'La solicitud de geocodificación no es válida.');
      const request = await requireOperations().getAddressGeocodingRequest(
        params.data.customerId,
        params.data.addressId,
        params.data.requestId,
      );
      return context.json(AddressGeocodingRequestSchema.parse(contractValue(request)));
    },
  );

  app.post(
    '/api/v1/customers/:customerId/addresses/:addressId/geocoding/:requestId/confirm',
    async (context) => {
      const permissions = context.get('session').permissions;
      if (
        !permissions.includes('customers.edit') ||
        !permissions.includes('customers.view_sensitive')
      )
        return forbidden(context);
      const params = AddressGeocodingParamSchema.safeParse(context.req.param());
      const input = AddressGeocodingConfirmRequestSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!params.success || !input.success)
        return badRequest(
          context,
          'Revisá la confirmación de ubicación.',
          input.success ? undefined : input.error.issues,
        );
      const address = await requireOperations().confirmAddressGeocoding(
        params.data.customerId,
        params.data.addressId,
        params.data.requestId,
        input.data,
        operationsContext(context),
      );
      return context.json(CustomerAddressSchema.parse(contractValue(address)));
    },
  );

  app.post(
    '/api/v1/customers/:customerId/addresses/:addressId/geocoding/:requestId/reject',
    async (context) => {
      const permissions = context.get('session').permissions;
      if (
        !permissions.includes('customers.edit') ||
        !permissions.includes('customers.view_sensitive')
      )
        return forbidden(context);
      const params = AddressGeocodingParamSchema.safeParse(context.req.param());
      const input = AddressGeocodingRejectRequestSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!params.success || !input.success)
        return badRequest(
          context,
          'Revisá el rechazo de ubicación.',
          input.success ? undefined : input.error.issues,
        );
      const request = await requireOperations().rejectAddressGeocoding(
        params.data.customerId,
        params.data.addressId,
        params.data.requestId,
        input.data.reason,
        operationsContext(context),
      );
      return context.json(AddressGeocodingRequestSchema.parse(contractValue(request)));
    },
  );

  app.post('/api/v1/customers/:id/preferences', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.edit') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = CustomerPreferenceCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá la preferencia.',
        input.success ? undefined : input.error.issues,
      );
    const preference = await requireOperations().addCustomerPreference(
      params.data.id,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerPreferenceSchema.parse(contractValue(preference)), 201);
  });

  app.patch('/api/v1/customers/:customerId/preferences/:relationId', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.edit') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = CustomerRelationParamSchema.safeParse(context.req.param());
    const input = CustomerPreferenceUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los cambios de la preferencia.',
        input.success ? undefined : input.error.issues,
      );
    const preference = await requireOperations().updateCustomerPreference(
      params.data.customerId,
      params.data.relationId,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerPreferenceSchema.parse(contractValue(preference)));
  });

  app.post('/api/v1/customers/:id/restrictions', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.restrict') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = CustomerRestrictionCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá la restricción.',
        input.success ? undefined : input.error.issues,
      );
    const restriction = await requireOperations().addCustomerRestriction(
      params.data.id,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerRestrictionSchema.parse(contractValue(restriction)), 201);
  });

  app.patch('/api/v1/customers/:customerId/restrictions/:relationId', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.restrict') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = CustomerRelationParamSchema.safeParse(context.req.param());
    const input = CustomerRestrictionUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los cambios de la restricción.',
        input.success ? undefined : input.error.issues,
      );
    const restriction = await requireOperations().updateCustomerRestriction(
      params.data.customerId,
      params.data.relationId,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerRestrictionSchema.parse(contractValue(restriction)));
  });

  app.get('/api/v1/message-templates', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('messages.templates.use') &&
      !permissions.includes('messages.templates.manage')
    )
      return forbidden(context);
    const items = await requireOperations().listMessageTemplates();
    return context.json(MessageTemplateListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.put('/api/v1/message-templates', async (context) => {
    if (!context.get('session').permissions.includes('messages.templates.manage'))
      return forbidden(context);
    const input = MessageTemplateUpsertRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá la plantilla de mensaje.', input.error.issues);
    const template = await requireOperations().upsertMessageTemplate(
      input.data,
      operationsContext(context),
    );
    return context.json(MessageTemplateSchema.parse(contractValue(template)));
  });

  app.get('/api/v1/messaging/accounts', async (context) => {
    if (!context.get('session').permissions.includes('messaging.accounts.manage'))
      return forbidden(context);
    const items = await requireMessaging().listAccounts();
    return context.json(MessagingAccountListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/messaging/accounts', async (context) => {
    if (!context.get('session').permissions.includes('messaging.accounts.manage'))
      return forbidden(context);
    const input = MessagingAccountCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá los datos de la cuenta.', input.error.issues);
    const account = await requireMessaging().createAccount(input.data, messagingContext(context));
    return context.json(MessagingAccountSchema.parse(contractValue(account)), 201);
  });

  app.patch('/api/v1/messaging/accounts/:id', async (context) => {
    if (!context.get('session').permissions.includes('messaging.accounts.manage'))
      return forbidden(context);
    const params = IdParamSchema.safeParse({ id: context.req.param('id') });
    const input = MessagingAccountUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los cambios de la cuenta.',
        (!params.success ? params.error.issues : undefined) ??
          (!input.success ? input.error.issues : undefined),
      );
    const account = await requireMessaging().updateAccount(
      params.data.id,
      input.data,
      messagingContext(context),
    );
    return context.json(MessagingAccountSchema.parse(contractValue(account)));
  });

  app.get('/api/v1/messaging/conversations', async (context) => {
    if (!context.get('session').permissions.includes('messages.read')) return forbidden(context);
    const items = await requireMessaging().listConversations();
    return context.json(
      MessagingConversationListResponseSchema.parse({ items: contractValue(items) }),
    );
  });

  app.get('/api/v1/messaging/conversations/:id/messages', async (context) => {
    if (!context.get('session').permissions.includes('messages.read')) return forbidden(context);
    const params = IdParamSchema.safeParse({ id: context.req.param('id') });
    if (!params.success) return badRequest(context, 'Conversación inválida.', params.error.issues);
    const items = await requireMessaging().getConversationMessages(params.data.id);
    return context.json(MessagingMessageListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/messaging/conversations/:id/messages', async (context) => {
    if (!context.get('session').permissions.includes('messages.send')) return forbidden(context);
    const params = IdParamSchema.safeParse({ id: context.req.param('id') });
    const input = MessagingSendRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá el mensaje.',
        (!params.success ? params.error.issues : undefined) ??
          (!input.success ? input.error.issues : undefined),
      );
    try {
      const message = await requireMessaging().sendMessage(
        params.data.id,
        input.data.body,
        messagingContext(context),
      );
      return context.json(contractValue(message), 201);
    } catch (error) {
      if (error instanceof Error && error.name === 'MessagingNotFoundError') {
        const code: ApiErrorCode = 'NOT_FOUND';
        return context.json(
          { error: { code, message: error.message, requestId: context.get('requestId') } },
          statusForCode(code),
        );
      }
      if (error instanceof Error && error.name === 'MessagingProviderError') {
        const code: ApiErrorCode = 'CONFLICT';
        return context.json(
          { error: { code, message: error.message, requestId: context.get('requestId') } },
          statusForCode(code),
        );
      }
      throw error;
    }
  });

  // Meta's subscription handshake: GET with hub.mode/hub.verify_token/hub.challenge, answered by
  // echoing the challenge back verbatim once the verify token matches. No auth — Meta calls this
  // directly — and no engine-configured guard either: an unconfigured deployment should answer
  // "verification failed" (403), not a generic 500, since this route existing-but-inert is the
  // expected steady state until a superadmin adds credentials.
  app.get('/api/v1/webhooks/whatsapp', (context) => {
    const challenge = messaging?.verifyChallenge(
      context.req.query('hub.mode') ?? null,
      context.req.query('hub.verify_token') ?? null,
      context.req.query('hub.challenge') ?? null,
    );
    if (!challenge) return context.text('Verification failed', 403);
    return context.text(challenge, 200);
  });

  // Inbound messages/delivery statuses. Meta retries on anything but a 200, so every branch
  // (unconfigured, bad signature, unroutable payload) still answers 200 once the signature check
  // passes — a webhook that 500s on a payload shape it doesn't understand yet just gets hammered
  // with retries for something that will never succeed.
  app.post('/api/v1/webhooks/whatsapp', async (context) => {
    const rawBody = await context.req.text();
    if (!messaging?.verifySignature(rawBody, context.req.header('x-hub-signature-256') ?? null)) {
      return context.text('Invalid signature', 403);
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return context.text('OK', 200);
    }
    await messaging
      .handleInboundEvent(payload)
      .catch((error: unknown) =>
        context.get('logger').error({ error }, 'whatsapp webhook processing failed'),
      );
    return context.text('OK', 200);
  });

  app.get('/api/v1/delivery/routes', async (context) => {
    if (!context.get('session').permissions.includes('routes.read')) return forbidden(context);
    const items = await requireDelivery().listRoutes(context.req.query('operatingSiteId'));
    return context.json(DeliveryRouteListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/delivery/routes', async (context) => {
    if (!context.get('session').permissions.includes('routes.manage')) return forbidden(context);
    const input = DeliveryRouteCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá los datos de la ruta.', input.error.issues);
    const route = await requireDelivery().createRoute(
      input.data.operatingSiteId,
      input.data.deliveryDate,
      input.data.label,
      deliveryContext(context),
    );
    return context.json(DeliveryRouteDetailSchema.parse(contractValue(route)), 201);
  });

  app.get('/api/v1/delivery/routes/:id', async (context) => {
    if (!context.get('session').permissions.includes('routes.read')) return forbidden(context);
    const params = IdParamSchema.safeParse({ id: context.req.param('id') });
    if (!params.success) return badRequest(context, 'Ruta inválida.', params.error.issues);
    const route = await requireDelivery().getRouteDetail(params.data.id);
    return context.json(DeliveryRouteDetailSchema.parse(contractValue(route)));
  });

  app.post('/api/v1/delivery/routes/:id/publish', async (context) => {
    if (!context.get('session').permissions.includes('routes.publish')) return forbidden(context);
    const params = IdParamSchema.safeParse({ id: context.req.param('id') });
    if (!params.success) return badRequest(context, 'Ruta inválida.', params.error.issues);
    const route = await requireDelivery().publishRoute(params.data.id, deliveryContext(context));
    return context.json(DeliveryRouteDetailSchema.parse(contractValue(route)));
  });

  app.put('/api/v1/delivery/routes/:id/stops', async (context) => {
    if (!context.get('session').permissions.includes('routes.manage')) return forbidden(context);
    const params = IdParamSchema.safeParse({ id: context.req.param('id') });
    const input = DeliveryStopReorderRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá el orden de las paradas.',
        (!params.success ? params.error.issues : undefined) ??
          (!input.success ? input.error.issues : undefined),
      );
    const route = await requireDelivery().reorderStops(params.data.id, input.data.stopIds);
    return context.json(DeliveryRouteDetailSchema.parse(contractValue(route)));
  });

  app.patch('/api/v1/delivery/stops/:id/assign', async (context) => {
    if (!context.get('session').permissions.includes('routes.manage')) return forbidden(context);
    const params = IdParamSchema.safeParse({ id: context.req.param('id') });
    const input = DeliveryStopAssignRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá la asignación.',
        (!params.success ? params.error.issues : undefined) ??
          (!input.success ? input.error.issues : undefined),
      );
    const stop = await requireDelivery().assignStop(
      params.data.id,
      input.data.assignedUserId,
      deliveryContext(context),
    );
    return context.json(contractValue(stop));
  });

  app.patch('/api/v1/delivery/stops/:id/status', async (context) => {
    if (!context.get('session').permissions.includes('delivery.execute')) return forbidden(context);
    const params = IdParamSchema.safeParse({ id: context.req.param('id') });
    const input = DeliveryStopStatusUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá el estado de la parada.',
        (!params.success ? params.error.issues : undefined) ??
          (!input.success ? input.error.issues : undefined),
      );
    const session = context.get('session');
    const stop = await requireDelivery().updateStopStatus(
      params.data.id,
      input.data.status,
      session.userId,
      deliveryContext(context),
    );
    return context.json(contractValue(stop));
  });

  app.post('/api/v1/delivery/stops/:id/trigger', async (context) => {
    if (!context.get('session').permissions.includes('delivery.trigger_messages'))
      return forbidden(context);
    const params = IdParamSchema.safeParse({ id: context.req.param('id') });
    const input = DeliveryTriggerRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá la acción a disparar.',
        (!params.success ? params.error.issues : undefined) ??
          (!input.success ? input.error.issues : undefined),
      );
    const result = await requireDelivery().triggerMessage(
      params.data.id,
      input.data.action,
      deliveryContext(context),
    );
    return context.json(DeliveryTriggerResponseSchema.parse(result));
  });

  app.get('/api/v1/delivery/my-stops', async (context) => {
    if (!context.get('session').permissions.includes('delivery.execute')) return forbidden(context);
    const session = context.get('session');
    const items = await requireDelivery().listStopsForUser(session.userId);
    return context.json(DeliveryMyStopListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/stats', async (context) => {
    if (!context.get('session').permissions.includes('stats.read')) return forbidden(context);
    const query = StatsQuerySchema.safeParse(context.req.query());
    if (!query.success) return badRequest(context, 'Revisá el filtro.', query.error.issues);
    const overview = await requireOperations().getStatsOverview(query.data);
    return context.json(StatsOverviewSchema.parse(contractValue(overview)));
  });

  app.get('/api/v1/payments', async (context) => {
    if (!context.get('session').permissions.includes('payments.read')) return forbidden(context);
    const items = await requirePayments().listByStatus(context.req.query('status'));
    return context.json(PaymentListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/payments/dashboard', async (context) => {
    if (!context.get('session').permissions.includes('payments.read')) return forbidden(context);
    const dashboard = await requirePayments().dashboard(context.req.query('operatingSiteId'));
    return context.json(PaymentsDashboardSchema.parse(contractValue(dashboard)));
  });

  app.get('/api/v1/payments/collections', async (context) => {
    if (!context.get('session').permissions.includes('payments.read')) return forbidden(context);
    const items = await requirePayments().listUnsettledCollections(
      context.req.query('collectedByUserId'),
    );
    return context.json(CashCollectionListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/payments/orders/:id/collections', async (context) => {
    if (!context.get('session').permissions.includes('payments.record')) return forbidden(context);
    const params = IdParamSchema.safeParse({ id: context.req.param('id') });
    const input = CashCollectionRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá el cobro.',
        (!params.success ? params.error.issues : undefined) ??
          (!input.success ? input.error.issues : undefined),
      );
    const collection = await requirePayments().recordCollection(
      params.data.id,
      input.data.amountMinor,
      input.data.method,
      paymentsContext(context),
    );
    return context.json(CashCollectionSchema.parse(contractValue(collection)), 201);
  });

  app.get('/api/v1/payments/methods', async (context) => {
    if (!context.get('session').permissions.includes('payments.read')) return forbidden(context);
    const items = await requirePayments().listPaymentMethods();
    return context.json(PaymentMethodListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.patch('/api/v1/payments/methods', async (context) => {
    if (!context.get('session').permissions.includes('payments.override'))
      return forbidden(context);
    const input = PaymentMethodsUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá los métodos de pago.', input.error.issues);
    const items = await requirePayments().updatePaymentMethods(
      input.data.methods,
      paymentsContext(context),
    );
    return context.json(PaymentMethodListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/payments/collections/:id/settle', async (context) => {
    if (!context.get('session').permissions.includes('payments.settle')) return forbidden(context);
    const params = IdParamSchema.safeParse({ id: context.req.param('id') });
    const input = CashSettlementRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá la rendición.',
        (!params.success ? params.error.issues : undefined) ??
          (!input.success ? input.error.issues : undefined),
      );
    const settlement = await requirePayments().settleCollection(
      params.data.id,
      input.data.receivedByUserId,
      paymentsContext(context),
    );
    return context.json(contractValue(settlement), 201);
  });

  app.get('/api/v1/menus', async (context) => {
    const permissions = context.get('session').permissions;
    if (!permissions.includes('orders.read') && !permissions.includes('production.read')) {
      return forbidden(context);
    }
    const items = await requireOperations().listMenus();
    return context.json(MenuListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/menus', async (context) => {
    if (!context.get('session').permissions.includes('production.generate'))
      return forbidden(context);
    const input = MenuCreateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Revisá la semana y sus opciones.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const menu = await requireOperations().createMenu(input.data, operationsContext(context));
    return context.json(
      MenuListResponseSchema.parse({ items: [contractValue(menu)] }).items[0],
      201,
    );
  });

  // "Los menús se deben poder modificar. Pueden haber errores de carga." — same body shape as
  // create, works on master or regional rows alike, and never depends on the target menu's status
  // (offering rows are snapshot-independent for any order already placed — see updateMenu's
  // comment in postgres-operations-service.ts).
  app.patch('/api/v1/menus/:id', async (context) => {
    if (!context.get('session').permissions.includes('production.generate'))
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = MenuCreateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá la semana y sus opciones.',
        input.success ? undefined : input.error.issues,
      );
    const menu = await requireOperations().updateMenu(
      params.data.id,
      input.data,
      operationsContext(context),
    );
    return context.json(MenuListResponseSchema.parse({ items: [contractValue(menu)] }).items[0]);
  });

  // "Precios por ubicación" editing: lighter than PATCH /api/v1/menus/:id — just the price for a
  // size on one already-distributed menu, without resubmitting its offerings/dishes.
  app.patch('/api/v1/menus/:id/prices', async (context) => {
    if (!context.get('session').permissions.includes('production.generate'))
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = MenuPricesUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los precios.',
        input.success ? undefined : input.error.issues,
      );
    const menu = await requireOperations().updateMenuPrices(
      params.data.id,
      input.data.prices,
      operationsContext(context),
    );
    return context.json(MenuListResponseSchema.parse({ items: [contractValue(menu)] }).items[0]);
  });

  // "Debemos permitir borrar los menús sin pedidos cargados" — deleteMenu itself checks for
  // existing orders and 409s with a clear message rather than surfacing the underlying
  // foreign-key restriction.
  app.delete('/api/v1/menus/:id', async (context) => {
    if (!context.get('session').permissions.includes('production.generate'))
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El menú indicado no es válido.');
    await requireOperations().deleteMenu(params.data.id, operationsContext(context));
    return context.body(null, 204);
  });

  app.post('/api/v1/menus/:id/distribute', async (context) => {
    const permissions = context.get('session').permissions;
    if (!permissions.includes('menus.distribute')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success)
      return badRequest(context, 'El menú indicado no es válido.', params.error.issues);
    const input = MenuDistributeRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) return badRequest(context, 'Revisá la distribución.', input.error.issues);
    // Replacing regional customisations is a separate grant, not a stronger flag on the same one.
    if (input.data.mode === 'REPLACE' && !permissions.includes('menus.distribute_replace'))
      return forbidden(context);
    const results = await requireOperations().distributeMenu(
      params.data.id,
      input.data,
      operationsContext(context),
    );
    return context.json(MenuDistributionResponseSchema.parse({ results: contractValue(results) }));
  });

  app.post('/api/v1/menus/:id/publish', async (context) => {
    if (!context.get('session').permissions.includes('production.generate'))
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            message: 'El menú indicado no es válido.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const menu = await requireOperations().publishMenu(params.data.id, operationsContext(context));
    return context.json(MenuListResponseSchema.parse({ items: [contractValue(menu)] }).items[0]);
  });

  app.get('/api/v1/orders', async (context) => {
    if (!context.get('session').permissions.includes('orders.read')) return forbidden(context);
    const query = OrderListQuerySchema.safeParse(context.req.query());
    if (!query.success)
      return badRequest(context, 'Los filtros de pedidos no son válidos.', query.error.issues);
    const page = await requireOperations().listOrders(scoped(context, query.data));
    return context.json(OrderPageResponseSchema.parse(contractValue(page)));
  });

  app.get('/api/v1/orders/export', async (context) => {
    if (!context.get('session').permissions.includes('orders.read')) return forbidden(context);
    const query = OrderListQuerySchema.safeParse(context.req.query());
    if (!query.success)
      return badRequest(context, 'Los filtros de exportación no son válidos.', query.error.issues);
    const filters: Omit<OrderListQuery, 'cursor' | 'limit'> = {
      ...(query.data.customerId ? { customerId: query.data.customerId } : {}),
      ...(query.data.cycleId ? { cycleId: query.data.cycleId } : {}),
      ...(query.data.from ? { from: query.data.from } : {}),
      ...(query.data.search ? { search: query.data.search } : {}),
      ...(query.data.status ? { status: query.data.status } : {}),
      ...(query.data.to ? { to: query.data.to } : {}),
      ...(query.data.zone ? { zone: query.data.zone } : {}),
    };
    const csv = await requireOperations().exportOrdersCsv(
      scoped(context, filters),
      operationsContext(context),
    );
    context.header('cache-control', 'private, no-store');
    context.header('content-disposition', 'attachment; filename="verdeo-pedidos.csv"');
    context.header('content-type', 'text/csv; charset=utf-8');
    return context.body(csv);
  });

  app.post('/api/v1/orders', async (context) => {
    if (!context.get('session').permissions.includes('orders.create')) return forbidden(context);
    const input = OrderCreateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Revisá los datos del pedido.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const order = await requireOperations().createOrder(
      scoped(context, input.data),
      operationsContext(context),
    );
    return context.json(OrderSchema.parse(contractValue(order)), 201);
  });

  app.get('/api/v1/orders/:id', async (context) => {
    if (!context.get('session').permissions.includes('orders.read')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El pedido indicado no es válido.');
    return context.json(
      OrderSchema.parse(contractValue(await requireOperations().getOrder(params.data.id))),
    );
  });

  app.patch('/api/v1/orders/:id', async (context) => {
    const session = context.get('session');
    if (!session.permissions.includes('orders.edit')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = OrderUpdateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los cambios del pedido.',
        input.success ? undefined : input.error.issues,
      );
    const order = await requireOperations().updateOrder(
      params.data.id,
      input.data,
      session.permissions.includes('orders.override_cycle_lock'),
      operationsContext(context),
    );
    return context.json(OrderSchema.parse(contractValue(order)));
  });

  app.get('/api/v1/orders/:id/history', async (context) => {
    if (!context.get('session').permissions.includes('orders.read')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El pedido indicado no es válido.');
    const items = await requireOperations().orderHistory(params.data.id);
    return context.json(OrderStatusHistoryResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/orders/:id/revisions', async (context) => {
    if (!context.get('session').permissions.includes('orders.read')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El pedido indicado no es válido.');
    const items = await requireOperations().orderRevisionHistory(params.data.id);
    return context.json(OrderRevisionListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/orders/:id/status', async (context) => {
    const session = context.get('session');
    const params = IdParamSchema.safeParse(context.req.param());
    const input = OrderTransitionRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            message: 'La transición solicitada no es válida.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const permission =
      input.data.status === 'CONFIRMED'
        ? input.data.confirmedReversal
          ? 'orders.revert_status'
          : 'orders.confirm'
        : input.data.status === 'CANCELLED'
          ? 'orders.cancel'
          : input.data.confirmedReversal
            ? 'orders.revert_status'
            : 'orders.edit';
    if (!session.permissions.includes(permission)) return forbidden(context);

    const order = await requireOperations().transitionOrder(
      params.data.id,
      input.data.status,
      input.data.reason,
      input.data.confirmedReversal,
      session.permissions.includes('orders.override_cycle_lock'),
      operationsContext(context),
    );
    return context.json(OrderSchema.parse(contractValue(order)));
  });

  app.get('/api/v1/production/:cycleId', async (context) => {
    if (!context.get('session').permissions.includes('production.read')) return forbidden(context);
    const params = CycleIdParamSchema.safeParse(context.req.param());
    if (!params.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            message: 'El ciclo indicado no es válido.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const summary = await requireOperations().kitchenSummary(
      params.data.cycleId,
      context.get('scope')?.operatingSiteId ?? null,
    );
    return context.json(KitchenSummaryResponseSchema.parse(contractValue(summary)));
  });

  app.get('/api/v1/production/:cycleId/actuals', async (context) => {
    if (!context.get('session').permissions.includes('production.read')) return forbidden(context);
    const params = CycleIdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El ciclo indicado no es válido.');
    const items = await requireOperations().listProductionActuals(params.data.cycleId);
    return context.json(ProductionActualListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/production/:cycleId/actuals', async (context) => {
    if (!context.get('session').permissions.includes('production.report'))
      return forbidden(context);
    const params = CycleIdParamSchema.safeParse(context.req.param());
    const input = ProductionReportRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá las cantidades informadas.',
        input.success ? undefined : input.error.issues,
      );
    const items = await requireOperations().reportProduction(
      params.data.cycleId,
      input.data.entries,
      operationsContext(context),
    );
    return context.json(ProductionActualListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/production/:cycleId/snapshots', async (context) => {
    if (!context.get('session').permissions.includes('production.read')) return forbidden(context);
    const params = CycleIdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El ciclo indicado no es válido.');
    const items = await requireOperations().listProductionSnapshots(params.data.cycleId);
    return context.json(
      ProductionSnapshotListResponseSchema.parse({ items: contractValue(items) }),
    );
  });

  app.post('/api/v1/production/:cycleId/snapshots', async (context) => {
    if (!context.get('session').permissions.includes('production.generate'))
      return forbidden(context);
    const params = CycleIdParamSchema.safeParse(context.req.param());
    const input = ProductionSnapshotRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Indicá si el snapshot es parcial o final.',
        input.success ? undefined : input.error.issues,
      );
    const snapshot = await requireOperations().generateProductionSnapshot(
      params.data.cycleId,
      input.data.kind,
      context.get('scope')?.operatingSiteId ?? null,
      operationsContext(context),
    );
    return context.json(ProductionSnapshotSchema.parse(contractValue(snapshot)), 201);
  });

  // "PDF" is the print-ready HTML page; the browser's own print dialog is the PDF adapter here
  // rather than a rendering library in the function bundle (see production-export.ts).
  app.get('/api/v1/production/:cycleId/snapshots/export', async (context) => {
    if (!context.get('session').permissions.includes('production.read')) return forbidden(context);
    const params = CycleIdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El ciclo indicado no es válido.');
    const kind = context.req.query('kind');
    const format = context.req.query('format');
    if (kind !== 'partial' && kind !== 'final')
      return badRequest(context, 'Indicá kind=partial o kind=final.');
    if (format !== 'xlsx' && format !== 'whatsapp' && format !== 'pdf')
      return badRequest(context, 'El formato debe ser xlsx, whatsapp o pdf.');

    const snapshots = await requireOperations().listProductionSnapshots(params.data.cycleId);
    const parsed = ProductionSnapshotListResponseSchema.parse({ items: contractValue(snapshots) });
    const snapshot = parsed.items.find((item) => item.kind === kind);
    if (!snapshot) {
      const code: ApiErrorCode = 'NOT_FOUND';
      return context.json(
        {
          error: {
            code,
            message: 'Todavía no se generó ese snapshot.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    context.header('cache-control', 'private, no-store');
    if (format === 'xlsx') {
      context.header(
        'content-disposition',
        `attachment; filename="${productionSnapshotFilenameBase(snapshot)}.xlsx"`,
      );
      context.header(
        'content-type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      return context.body(buildProductionExcel(snapshot).buffer as ArrayBuffer, 200);
    }
    if (format === 'whatsapp') {
      context.header('content-type', 'text/plain; charset=utf-8');
      return context.body(buildProductionWhatsAppText(snapshot));
    }
    context.header('content-type', 'text/html; charset=utf-8');
    return context.html(buildProductionPrintHtml(snapshot));
  });

  app.get('/api/v1/production/:cycleId/surplus', async (context) => {
    if (!context.get('session').permissions.includes('production.read')) return forbidden(context);
    const params = CycleIdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El ciclo indicado no es válido.');
    const report = await requireOperations().surplusReport(params.data.cycleId);
    return context.json(SurplusReportResponseSchema.parse(contractValue(report)));
  });

  app.post('/api/v1/production/:cycleId/surplus/writeoffs', async (context) => {
    if (!context.get('session').permissions.includes('production.adjust_surplus'))
      return forbidden(context);
    const params = CycleIdParamSchema.safeParse(context.req.param());
    const input = SurplusWriteoffRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá las bajas informadas.',
        input.success ? undefined : input.error.issues,
      );
    const items = await requireOperations().writeOffSurplus(
      params.data.cycleId,
      input.data.entries,
      operationsContext(context),
    );
    return context.json(SurplusReportResponseSchema.shape.items.parse(contractValue(items)));
  });

  app.get('/api/v1/surplus/config', async (context) => {
    if (!context.get('session').permissions.includes('production.read')) return forbidden(context);
    const config = await requireOperations().getSurplusConfig();
    return context.json(SurplusConfigSchema.parse(contractValue(config)));
  });

  app.patch('/api/v1/surplus/config', async (context) => {
    if (!context.get('session').permissions.includes('production.adjust_surplus'))
      return forbidden(context);
    const input = SurplusConfigUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'El coeficiente debe estar entre 0 y 100.', input.error.issues);
    const config = await requireOperations().setSurplusConfig(
      input.data.coefficientPercent,
      operationsContext(context),
    );
    return context.json(SurplusConfigSchema.parse(contractValue(config)));
  });

  app.get('/api/v1/menu-catalog/settings', async (context) => {
    if (!context.get('session').permissions.includes('production.read')) return forbidden(context);
    const items = await requireOperations().listMenuCatalogSettings();
    return context.json(
      MenuCatalogSettingsListResponseSchema.parse({ items: contractValue(items) }),
    );
  });

  app.patch('/api/v1/menu-catalog/settings/:operatingSiteId', async (context) => {
    if (!context.get('session').permissions.includes('production.generate'))
      return forbidden(context);
    const params = IdParamSchema.safeParse({ id: context.req.param('operatingSiteId') });
    const input = MenuCatalogSettingsUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá la configuración del menú.',
        (!params.success ? params.error.issues : undefined) ??
          (!input.success ? input.error.issues : undefined),
      );
    await requireOperations().setIntuitivoEnabled(
      params.data.id,
      input.data.intuitivoEnabled,
      operationsContext(context),
    );
    const items = await requireOperations().listMenuCatalogSettings();
    return context.json(
      MenuCatalogSettingsListResponseSchema.parse({ items: contractValue(items) }),
    );
  });

  // --- Kitchen labels: on-demand only, never generated automatically on order confirm --------

  app.get('/api/v1/production/:cycleId/labels', async (context) => {
    if (!context.get('session').permissions.includes('production.read')) return forbidden(context);
    const params = CycleIdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El ciclo indicado no es válido.');
    const items = await requireOperations().cycleLabels(
      params.data.cycleId,
      context.get('scope')?.operatingSiteId ?? null,
    );
    return context.json(LabelListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/production/:cycleId/labels/export', async (context) => {
    if (!context.get('session').permissions.includes('production.read')) return forbidden(context);
    const params = CycleIdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El ciclo indicado no es válido.');
    const [items, settings] = await Promise.all([
      requireOperations().cycleLabels(
        params.data.cycleId,
        context.get('scope')?.operatingSiteId ?? null,
      ),
      requireOperations().getLabelSettings(),
    ]);
    context.header('content-type', 'text/html; charset=utf-8');
    return context.html(
      buildLabelsPrintHtml(
        LabelListResponseSchema.shape.items.parse(contractValue(items)),
        LabelSettingsSchema.parse(contractValue(settings)),
        'Etiquetas de cocina',
      ),
    );
  });

  app.get('/api/v1/orders/:id/labels', async (context) => {
    if (!context.get('session').permissions.includes('orders.read')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El pedido indicado no es válido.');
    const items = await requireOperations().orderLabels(params.data.id);
    return context.json(LabelListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/orders/:id/labels/export', async (context) => {
    if (!context.get('session').permissions.includes('orders.read')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El pedido indicado no es válido.');
    const [items, settings] = await Promise.all([
      requireOperations().orderLabels(params.data.id),
      requireOperations().getLabelSettings(),
    ]);
    context.header('content-type', 'text/html; charset=utf-8');
    return context.html(
      buildLabelsPrintHtml(
        LabelListResponseSchema.shape.items.parse(contractValue(items)),
        LabelSettingsSchema.parse(contractValue(settings)),
        'Etiquetas de pedido',
      ),
    );
  });

  app.get('/api/v1/label-settings', async (context) => {
    if (!context.get('session').permissions.includes('production.read')) return forbidden(context);
    const settings = await requireOperations().getLabelSettings();
    return context.json(LabelSettingsSchema.parse(contractValue(settings)));
  });

  app.patch('/api/v1/label-settings', async (context) => {
    if (!context.get('session').permissions.includes('production.generate'))
      return forbidden(context);
    const input = LabelSettingsUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá la configuración de etiquetas.', input.error.issues);
    const settings = await requireOperations().setLabelSettings(
      input.data,
      operationsContext(context),
    );
    return context.json(LabelSettingsSchema.parse(contractValue(settings)));
  });

  const LABEL_BACKGROUND_ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png']);
  const LABEL_BACKGROUND_MAX_BYTES = 8 * 1024 * 1024;

  app.post('/api/v1/label-settings/background', async (context) => {
    if (!context.get('session').permissions.includes('production.generate'))
      return forbidden(context);
    const contentType = context.req.header('content-type') ?? '';
    if (!LABEL_BACKGROUND_ALLOWED_CONTENT_TYPES.has(contentType))
      return badRequest(context, 'El fondo debe ser una imagen JPEG o PNG.');
    const bytes = new Uint8Array(await context.req.arrayBuffer());
    if (bytes.byteLength === 0) return badRequest(context, 'El archivo está vacío.');
    if (bytes.byteLength > LABEL_BACKGROUND_MAX_BYTES)
      return badRequest(context, 'La imagen no puede superar los 8 MB.');
    const { url } = await requireAvatarStorage().uploadMedia(bytes, contentType);
    return context.json({ url }, 201);
  });

  // --- Customer surveys: 1:1 token per customer, single-use ---------------------------------

  app.get('/api/v1/surveys', async (context) => {
    if (!context.get('session').permissions.includes('surveys.read')) return forbidden(context);
    const items = await requireSurveys().listSurveys();
    return context.json(SurveyListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/surveys', async (context) => {
    if (!context.get('session').permissions.includes('surveys.manage')) return forbidden(context);
    const input = SurveyCreateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) return badRequest(context, 'Revisá la encuesta.', input.error.issues);
    const survey = await requireSurveys().createSurvey(input.data, surveyContext(context));
    return context.json(SurveySchema.parse(contractValue(survey)), 201);
  });

  app.get('/api/v1/surveys/:id', async (context) => {
    if (!context.get('session').permissions.includes('surveys.read')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'La encuesta indicada no es válida.');
    const survey = await requireSurveys().getSurvey(params.data.id);
    return context.json(SurveySchema.parse(contractValue(survey)));
  });

  app.patch('/api/v1/surveys/:id', async (context) => {
    if (!context.get('session').permissions.includes('surveys.manage')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = SurveyUpdateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá la encuesta.',
        input.success ? undefined : input.error.issues,
      );
    const survey = await requireSurveys().updateSurvey(
      params.data.id,
      input.data,
      surveyContext(context),
    );
    return context.json(SurveySchema.parse(contractValue(survey)));
  });

  app.post('/api/v1/surveys/:id/send', async (context) => {
    if (!context.get('session').permissions.includes('surveys.manage')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = SurveySendRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!params.success || !input.success)
      return badRequest(context, 'Elegí un cliente para enviar la encuesta.');
    const sent = (await requireSurveys().sendSurvey(
      params.data.id,
      input.data.customerId,
      surveyContext(context),
    )) as { token: string };
    return context.json(
      SurveySendResponseSchema.parse({
        publicUrl: `${options.appOrigin}/public/survey/${sent.token}`,
        token: sent.token,
      }),
      201,
    );
  });

  app.get('/api/v1/surveys/:id/results', async (context) => {
    if (!context.get('session').permissions.includes('surveys.read')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'La encuesta indicada no es válida.');
    const results = await requireSurveys().getSurveyResults(params.data.id);
    return context.json(SurveyResultsSchema.parse(contractValue(results)));
  });

  // --- Ayuda modularizada: every signed-in user sees only articles with no permission gate or
  // one they actually hold; the editor (help.manage) sees and edits everything. ---------------

  app.get('/api/v1/help', async (context) => {
    const items = await requireHelp().listVisible(context.get('session').permissions);
    return context.json(HelpArticleListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/help/all', async (context) => {
    if (!context.get('session').permissions.includes('help.manage')) return forbidden(context);
    const items = await requireHelp().listAll();
    return context.json(HelpArticleListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/help', async (context) => {
    if (!context.get('session').permissions.includes('help.manage')) return forbidden(context);
    const input = HelpArticleUpsertRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) return badRequest(context, 'Revisá el artículo.', input.error.issues);
    const article = await requireHelp().createArticle(input.data, helpContext(context));
    return context.json(HelpArticleSchema.parse(contractValue(article)), 201);
  });

  app.patch('/api/v1/help/:id', async (context) => {
    if (!context.get('session').permissions.includes('help.manage')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = HelpArticleUpsertRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá el artículo.',
        input.success ? undefined : input.error.issues,
      );
    const article = await requireHelp().updateArticle(
      params.data.id,
      input.data,
      helpContext(context),
    );
    return context.json(HelpArticleSchema.parse(contractValue(article)));
  });

  app.delete('/api/v1/help/:id', async (context) => {
    if (!context.get('session').permissions.includes('help.manage')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El artículo indicado no es válido.');
    await requireHelp().deleteArticle(params.data.id, helpContext(context));
    return context.body(null, 204);
  });

  app.get('/api/v1/ai/providers', async (context) => {
    if (!context.get('session').permissions.includes('ai.providers.manage'))
      return forbidden(context);
    if (!options.aiConfiguration) throw new Error('AI configuration engine is not configured');
    return context.json(
      AIProviderConfigListResponseSchema.parse(contractValue(await options.aiConfiguration.list())),
    );
  });

  app.put('/api/v1/ai/providers', async (context) => {
    const session = context.get('session');
    if (!session.permissions.includes('ai.providers.manage')) return forbidden(context);
    if (!options.aiConfiguration) throw new Error('AI configuration engine is not configured');
    const input = AIProviderConfigUpsertRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Revisá la configuración del proveedor.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const requestId = context.get('requestId');
    const result = await options.aiConfiguration.upsert(input.data, {
      actorUserId: session.userId,
      correlationId: requestId,
      requestId,
      source: 'api',
    });
    return context.json(AIProviderConfigListResponseSchema.parse(contractValue(result)));
  });

  // Integration keys live under the same "ai.providers.manage" permission as the AI ones: they are
  // the same class of secret, administered from the same Ajustes screen by the same person.
  app.get('/api/v1/integrations/credentials', async (context) => {
    if (!context.get('session').permissions.includes('ai.providers.manage'))
      return forbidden(context);
    if (!options.integrationCredentials)
      throw new Error('Integration credentials engine is not configured');
    return context.json(
      IntegrationCredentialListResponseSchema.parse(
        contractValue(await options.integrationCredentials.list()),
      ),
    );
  });

  /**
   * Sends one real email to an address the operator names, so a misconfiguration surfaces here
   * rather than the first time a customer waits for a login link that never arrives. The provider's
   * own rejection is passed straight through — "domain not verified" is actionable, a 500 is not.
   */
  app.post('/api/v1/integrations/email/test', async (context) => {
    const session = context.get('session');
    if (!session.permissions.includes('ai.providers.manage')) return forbidden(context);
    if (!options.emailSender) throw new Error('Email sender is not configured');
    const input = EmailTestRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success)
      return badRequest(context, 'Ingresá una dirección válida.', input.error.issues);

    const body = renderEmail({
      bodyHtml: '<p>Si estás leyendo esto, el envío de correo de Verdeo quedó configurado.</p>',
      bodyText: 'Si estás leyendo esto, el envío de correo de Verdeo quedó configurado.',
      heading: 'Prueba de configuración',
    });
    const result = await options.emailSender.send({
      html: body.html,
      subject: 'Verdeo · prueba de configuración',
      text: body.text,
      to: input.data.to,
    });

    return context.json(
      EmailTestResponseSchema.parse({ reason: result.reason ?? null, sent: result.sent }),
    );
  });

  app.put('/api/v1/integrations/credentials', async (context) => {
    const session = context.get('session');
    if (!session.permissions.includes('ai.providers.manage')) return forbidden(context);
    if (!options.integrationCredentials)
      throw new Error('Integration credentials engine is not configured');
    const input = IntegrationCredentialUpsertRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Revisá la configuración de la integración.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const requestId = context.get('requestId');
    const result = await options.integrationCredentials.upsert(input.data, {
      actorUserId: session.userId,
      correlationId: requestId,
      requestId,
      source: 'api',
    });
    return context.json(IntegrationCredentialListResponseSchema.parse(contractValue(result)));
  });

  app.get('/api/v1/ai/prompts', async (context) => {
    if (!context.get('session').permissions.includes('ai.prompts.manage'))
      return forbidden(context);
    const items = await requireAiPrompts().listPrompts();
    return context.json(AIPromptSummaryListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/ai/prompts/:taskKey', async (context) => {
    if (!context.get('session').permissions.includes('ai.prompts.manage'))
      return forbidden(context);
    const detail = await requireAiPrompts().getPromptDetail(context.req.param('taskKey'));
    return context.json(AIPromptDetailSchema.parse(contractValue(detail)));
  });

  app.post('/api/v1/ai/prompts/:taskKey/versions', async (context) => {
    if (!context.get('session').permissions.includes('ai.prompts.manage'))
      return forbidden(context);
    const input = AIPromptVersionCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) return badRequest(context, 'Revisá el prompt.', input.error.issues);
    const detail = await requireAiPrompts().createVersion(
      context.req.param('taskKey'),
      input.data,
      aiEngineContext(context),
    );
    return context.json(AIPromptDetailSchema.parse(contractValue(detail)), 201);
  });

  app.post('/api/v1/ai/prompts/:taskKey/activate', async (context) => {
    if (!context.get('session').permissions.includes('ai.prompts.manage'))
      return forbidden(context);
    const input = AIPromptVersionActivateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá la versión a activar.', input.error.issues);
    const detail = await requireAiPrompts().activateVersion(
      context.req.param('taskKey'),
      input.data.versionId,
      aiEngineContext(context),
    );
    return context.json(AIPromptDetailSchema.parse(contractValue(detail)));
  });

  app.get('/api/v1/ai/executions', async (context) => {
    if (!context.get('session').permissions.includes('ai.prompts.manage'))
      return forbidden(context);
    const items = await requireAiTasks().listExecutions(context.req.query('taskKey'));
    return context.json(AIExecutionListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/audit', async (context) => {
    if (!context.get('session').permissions.includes('audit.read')) return forbidden(context);
    const query = AuditEventQuerySchema.safeParse(context.req.query());
    if (!query.success) return badRequest(context, 'Revisá los filtros.', query.error.issues);
    const result = await requireAuditQuery().listEvents(query.data);
    return context.json(AuditEventListResponseSchema.parse(contractValue(result)));
  });

  app.get('/api/v1/audit/facets', async (context) => {
    if (!context.get('session').permissions.includes('audit.read')) return forbidden(context);
    const facets = await requireAuditQuery().listFacets();
    return context.json(AuditFacetsResponseSchema.parse(contractValue(facets)));
  });

  app.post('/api/v1/ai/tasks/:taskKey/run', async (context) => {
    if (!context.get('session').permissions.includes('ai.use')) return forbidden(context);
    const input = AITaskRunRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success)
      return badRequest(context, 'Revisá los datos de la tarea.', input.error.issues);
    const result = await requireAiTasks().runTask(
      context.req.param('taskKey'),
      input.data.variables,
      aiEngineContext(context),
    );
    return context.json(AITaskRunResponseSchema.parse(contractValue(result)));
  });

  app.notFound((context) => {
    const code: ApiErrorCode = 'NOT_FOUND';
    return context.json(
      {
        error: {
          code,
          message: 'El recurso solicitado no existe.',
          requestId: context.get('requestId'),
        },
      },
      statusForCode(code),
    );
  });

  app.onError((error, context) => {
    if (
      error.name === 'OperationsNotFoundError' ||
      error.name === 'OperatingSiteNotFoundError' ||
      error.name === 'ChatNotFoundError' ||
      error.name === 'GeographicZoneNotFoundError' ||
      error.name === 'DeliveryNotFoundError' ||
      error.name === 'PaymentsNotFoundError' ||
      error.name === 'AIPromptNotFoundError' ||
      error.name === 'AITaskNotFoundError' ||
      error.name === 'SurveyNotFoundError' ||
      error.name === 'HelpArticleNotFoundError'
    ) {
      const code: ApiErrorCode = 'NOT_FOUND';
      return context.json(
        { error: { code, message: error.message, requestId: context.get('requestId') } },
        statusForCode(code),
      );
    }
    if (error.name === 'ChatForbiddenError') {
      const code: ApiErrorCode = 'FORBIDDEN';
      return context.json(
        { error: { code, message: error.message, requestId: context.get('requestId') } },
        statusForCode(code),
      );
    }
    if (
      error.name === 'OperationsConflictError' ||
      error.name === 'GeographyConflictError' ||
      error.name === 'ChatConflictError' ||
      error.name === 'OrderRuleError' ||
      error.name === 'CustomerRuleError' ||
      error.name === 'AIConfigurationUnavailableError' ||
      error.name === 'DeliveryConflictError' ||
      error.name === 'PaymentsConflictError' ||
      error.name === 'AITaskNotConfiguredError' ||
      error.name === 'AITaskValidationError' ||
      error.name === 'NoProviderAvailableError' ||
      error.name === 'SurveyConflictError'
    ) {
      const code: ApiErrorCode = 'CONFLICT';
      return context.json(
        { error: { code, message: error.message, requestId: context.get('requestId') } },
        statusForCode(code),
      );
    }
    (context.get('logger') ?? options.logger).error({ error, event: 'http.request.failed' });
    const code: ApiErrorCode = 'INTERNAL_ERROR';
    return context.json(
      {
        error: {
          code,
          message: 'Ocurrió un error inesperado.',
          requestId: context.get('requestId'),
        },
      },
      statusForCode(code),
    );
  });

  return app;
}
