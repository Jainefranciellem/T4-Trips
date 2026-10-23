import { Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { PricingSimulator } from '@/components/planning/PricingSimulator';
import { useAuth } from '@/contexts/AuthContext';

// Cenários independentes, sem viagem (RF-021) — pra orçar um pacote novo.
const Simulator = () => {
  const { can } = useAuth();
  if (!can('finance.read')) return <Navigate to="/viagens" replace />;
  return (
    <div>
      <PageHeader title="Simulador de preços" description="Cenários avulsos para orçar um pacote antes de criar a viagem" />
      <PricingSimulator tripId={null} />
    </div>
  );
};

export default Simulator;
