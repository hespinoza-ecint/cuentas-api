import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RequireVerifiedEmail } from '../../common/auth/require-verified-email.decorator';
import { requestMeta } from '../../common/http/request-meta';
import { CardsService } from './cards.service';
import {
  CreateCardDto,
  ListCardLedgerQueryDto,
  ReconcileCardDto,
  UpdateCardDto,
  UpdateStatementDto,
} from './dto/card.dto';
import { CardsRepository } from './repositories/cards.repository';
import { StatementsService } from './statements.service';

@ApiTags('cards')
@ApiBearerAuth('access-token')
@Controller('cards')
export class CardsController {
  constructor(
    private readonly cardsService: CardsService,
    private readonly statementsService: StatementsService,
    private readonly cardsRepository: CardsRepository,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.cardsService.list(user.id);
  }

  @Post()
  @RequireVerifiedEmail()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCardDto,
    @Req() request: FastifyRequest,
  ) {
    return this.cardsService.create(user.id, dto, requestMeta(request));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cardsService.get(user.id, id);
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCardDto,
    @Req() request: FastifyRequest,
  ) {
    return this.cardsService.update(user.id, id, dto, requestMeta(request));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireVerifiedEmail()
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.cardsService.remove(user.id, id, requestMeta(request));
  }

  @Post(':id/reconcile')
  @RequireVerifiedEmail()
  reconcile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReconcileCardDto,
    @Req() request: FastifyRequest,
  ) {
    return this.cardsService.reconcile(user.id, id, dto, requestMeta(request));
  }

  @Get(':id/ledger')
  async ledger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListCardLedgerQueryDto,
  ) {
    await this.cardsService.get(user.id, id);
    const limit = query.limit ?? 20;
    const { items, nextCursor } = await this.cardsRepository.listLedger(
      user.id,
      id,
      query,
      limit,
    );
    return { data: items, meta: { limit, nextCursor, hasMore: nextCursor !== null } };
  }

  @Get(':id/statements')
  listStatements(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.statementsService.list(user.id, id);
  }

  @Get(':id/statements/current')
  currentCycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.statementsService.currentCycle(user.id, id);
  }

  @Get(':id/statements/:statementId')
  getStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
  ) {
    return this.statementsService.get(user.id, id, statementId);
  }

  @Patch(':id/statements/:statementId')
  @RequireVerifiedEmail()
  updateStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
    @Body() dto: UpdateStatementDto,
    @Req() request: FastifyRequest,
  ) {
    return this.statementsService.updateReportedAmounts(
      user.id,
      id,
      statementId,
      dto,
      requestMeta(request),
    );
  }
}
