-- Huella de tablas que E3 no debe tocar (recuentos y sumas, sin datos personales).
select 'StockMovement' t, count(*)::text n from "StockMovement"
union all select 'Purchase', count(*)::text from "Purchase"
union all select 'PayableAccount', count(*)::text from "PayableAccount"
union all select 'SyncV1Contribution', count(*)::text from "SyncV1Contribution"
union all select 'JointPurchaseProposalLine', count(*)::text from "JointPurchaseProposalLine"
union all select 'JointPurchaseParticipation', count(*)::text from "JointPurchaseParticipation"
union all select 'JointPurchaseParticipationLine', coalesce(sum("quantityBase"),0)::text from "JointPurchaseParticipationLine"
union all select 'InventoryLot', count(*)::text from "InventoryLot"
union all select 'Payment', count(*)::text from "Payment";
