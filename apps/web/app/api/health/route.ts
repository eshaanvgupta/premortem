export const dynamic = 'force-static';
export function GET() {
  return Response.json({
    status: 'ok',
    product: 'NEXORA',
    protocol: 'premortem/1',
    chainId: 56,
    deployed: Boolean(process.env.NEXT_PUBLIC_PREMORTEM_REGISTRY),
  });
}
