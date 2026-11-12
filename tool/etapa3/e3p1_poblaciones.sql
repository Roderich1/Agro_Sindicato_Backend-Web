-- Por producto del borrador con referencia fijada: miembros de la necesidad vs miembros de cada cifra de consumo del tramo.
with prop as (select '84e18f96-fc27-4aec-9adf-7fdd6ab4a74c'::uuid id),
need as (
  select l."canonicalProductId" p, l."baseUnit" u, c."memberId" m
  from "JointPurchaseProposalLine" l join prop on l."proposalId"=prop.id
  join "CollectiveReleaseItem" i on i."releaseId"=l."releaseId"
  join "SyncV1Contribution" c on c.id=i."contributionId"),
run as (select "runId" id from "JointPurchaseProposalEstimationLink" where "proposalId"=(select id from prop) order by sequence desc limit 1),
span as (
  select r."canonicalProductId" p, r."baseUnit" u, sp.position, sp."sourceReleaseId" rel
  from "EstimationResult" r join run on r."runId"=run.id
  join "SeriesPoint" sp on sp."seriesId"=r."seriesId"
  where r.status='ESTIMATED' and sp.position between r."spanFirstPosition" and r."spanLastPosition"),
cons as (
  select s.p, s.u, s.position, c."memberId" m
  from span s join "CollectiveReleaseItem" i on i."releaseId"=s.rel join "SyncV1Contribution" c on c.id=i."contributionId")
select left(pr.name,22) producto,
  (select count(distinct m) from need n where n.p=s.p and n.u=s.u) necesidad,
  count(distinct s.position) campañas_tramo,
  sum(case when (select array_agg(distinct m order by m) from cons c where c.p=s.p and c.u=s.u and c.position=s.position)
              = (select array_agg(distinct m order by m) from need n where n.p=s.p and n.u=s.u) then 1 else 0 end) iguales_a_necesidad,
  min((select count(distinct m) from cons c where c.p=s.p and c.u=s.u and c.position=s.position)) min_consumo,
  max((select count(distinct m) from cons c where c.p=s.p and c.u=s.u and c.position=s.position)) max_consumo
from (select distinct p,u,position from span) s join "Product" pr on pr.id=s.p
group by pr.name, s.p, s.u order by 1;
