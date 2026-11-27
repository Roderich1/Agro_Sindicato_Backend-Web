import { Inject, Injectable, Logger } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CollectiveConfig } from "@/modules/collective/application/collective-config";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { InstitutionalActor } from "../domain/call-error";
import { CallClosingService } from "./call-closing.service";
import {
  CallDetailViewV2,
  CallSummaryView,
  ClosingViewV2,
  CollaboratorsViewV2,
  ParticipantsViewV2,
} from "./call-views";
import { Clock, JOINT_PURCHASE_CLOCK } from "./clock";
import {
  grantCollaborator,
  reviewCallDelegation,
  revokeCollaborator,
} from "./institutional/institutional-calls.access";
import { renderDetailView } from "./institutional/institutional-calls.detail-view";
import { ClosedProductHistoryQuery, ClosedProductHistoryView, getClosedProductHistory } from "./institutional/institutional-calls.closed-product-history";
import {
  cancelCall,
  closeCall,
  createCall,
  openCall,
  patchCall,
} from "./institutional/institutional-calls.lifecycle";
import {
  CancelCommand,
  ConfirmCommand,
  DraftCommand,
  GrantCommand,
  InstitutionalCallDeps,
  ListFilter,
  PatchCommand,
} from "./institutional/institutional-calls.types";
import {
  getCallParticipants,
  listCalls,
  listEligibleResponsibles,
  renderClosingView,
  renderCollaboratorsView,
} from "./institutional/institutional-calls.views";

export { eligibleMemberWhere, INSTITUTIONAL_ROLES } from "./call-access";
export {
  MAX_PRODUCTS,
  NAME_MAX,
  OPENED_DETAIL,
  parseGrant,
  REASON_MAX,
  requireConfirmed,
  truncate,
} from "./institutional/institutional-calls.types";
export type {
  CancelCommand,
  ConfirmCommand,
  DraftCommand,
  GrantCommand,
  ListFilter,
  PatchCommand,
} from "./institutional/institutional-calls.types";

/**
 * E2 §4.1: joint purchase calls of the Directiva of the effective tenant.
 */
@Injectable()
export class InstitutionalCallsUseCase {
  private readonly logger = new Logger("JointPurchaseCalls");

  constructor(
    private readonly prisma: PrismaService,
    private readonly collective: CollectiveConfig,
    private readonly closing: CallClosingService,
    @Inject(JOINT_PURCHASE_CLOCK) private readonly clock: Clock,
  ) {}

  private deps(): InstitutionalCallDeps {
    return {
      prisma: this.prisma,
      collective: this.collective,
      closing: this.closing,
      clock: this.clock,
      logger: this.logger,
    };
  }

  async list(actor: InstitutionalActor, filter: ListFilter): Promise<{ contractVersion: 1; calls: CallSummaryView[] }> {
    return listCalls(this.prisma, actor, filter);
  }

  async eligibleResponsibles(
    actor: InstitutionalActor,
  ): Promise<{ contractVersion: 1; users: { user_ref: string; name: string; role: UserRole }[] }> {
    return listEligibleResponsibles(this.prisma, actor);
  }

  async detail(actor: InstitutionalActor, id: string): Promise<CallDetailViewV2> {
    return renderDetailView(this.prisma, this.collective, this.clock, actor, id);
  }

  async participants(actor: InstitutionalActor, id: string): Promise<ParticipantsViewV2> {
    return getCallParticipants(this.prisma, actor, id);
  }

  async closingView(actor: InstitutionalActor, id: string): Promise<ClosingViewV2> {
    return renderClosingView(this.prisma, actor, id);
  }

  async closedProductHistory(actor: InstitutionalActor, query: ClosedProductHistoryQuery): Promise<ClosedProductHistoryView> {
    return getClosedProductHistory(this.prisma, actor, query);
  }

  async create(actor: InstitutionalActor, command: DraftCommand): Promise<CallDetailViewV2> {
    return createCall(this.deps(), actor, command);
  }

  async patch(actor: InstitutionalActor, id: string, command: PatchCommand): Promise<CallDetailViewV2> {
    return patchCall(this.deps(), actor, id, command);
  }

  async open(actor: InstitutionalActor, id: string, command: ConfirmCommand): Promise<CallDetailViewV2> {
    return openCall(this.deps(), actor, id, command);
  }

  async cancel(actor: InstitutionalActor, id: string, command: CancelCommand): Promise<CallDetailViewV2> {
    return cancelCall(this.deps(), actor, id, command);
  }

  async close(actor: InstitutionalActor, id: string, command: ConfirmCommand): Promise<ClosingViewV2> {
    return closeCall(this.deps(), actor, id, command);
  }

  async collaborators(actor: InstitutionalActor, id: string): Promise<CollaboratorsViewV2> {
    return renderCollaboratorsView(this.prisma, actor, id);
  }

  async grant(actor: InstitutionalActor, id: string, command: GrantCommand): Promise<CollaboratorsViewV2> {
    return grantCollaborator(this.deps(), actor, id, command);
  }

  async revoke(actor: InstitutionalActor, id: string, command: GrantCommand): Promise<CollaboratorsViewV2> {
    return revokeCollaborator(this.deps(), actor, id, command);
  }

  async reviewDelegation(
    actor: InstitutionalActor,
    id: string,
    command: { user_ref?: unknown; grant?: unknown; decision?: unknown },
  ): Promise<CollaboratorsViewV2> {
    return reviewCallDelegation(this.deps(), actor, id, command);
  }
}
