import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

// Erro inesperado na tela vira uma mensagem com saída, em vez de página branca.
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Erro na tela:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6 text-center" role="alert">
        <p className="text-lg font-semibold">Algo deu errado nesta tela.</p>
        <p className="text-sm text-muted-foreground max-w-sm">Seus dados estão salvos. Recarregue a página; se continuar, avise o suporte dizendo o que estava fazendo.</p>
        <Button onClick={() => window.location.reload()}>Recarregar</Button>
      </div>
    );
  }
}
