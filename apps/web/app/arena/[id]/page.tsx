import { WarRoom } from '../../../components/war-room';
export const metadata = { title: 'War Room' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WarRoom id={id} />;
}
