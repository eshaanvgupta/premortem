import { History } from '../../components/history';
import { ReceiptVerifier } from '../../components/verifier';
export const metadata = { title: 'Flight Recorder' };
export default function Page() {
  return (
    <>
      <History mode="recorder" />
      <div className="page no-top">
        <ReceiptVerifier />
      </div>
    </>
  );
}
