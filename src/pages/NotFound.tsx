import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const NotFound = () => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-4 text-center">
    <p className="text-5xl font-black text-primary">404</p>
    <p className="text-muted-foreground">Página não encontrada.</p>
    <Button asChild>
      <Link to="/viagens">Voltar para Minhas Trips</Link>
    </Button>
  </div>
);

export default NotFound;
