import { useNavigate } from 'react-router-dom';
import ImportResultPanel from '../../components/ImportResultPanel';

/** Standalone /results/new route — the same import panel the Results list toggles inline. */
export default function RaceResultFormPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">Add result</h1>
      <ImportResultPanel onCancel={() => navigate('/results')} />
    </div>
  );
}
