export function GET() {
  return Response.json({
    status: 'ok',
    protocol: 'premortem/1',
    chainId: 56,
    deployed: Boolean(process.env.NEXT_PUBLIC_PREMORTEM_REGISTRY),
  });
}
