import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell } from '@/components/common/AuthShell';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { Loader2 } from 'lucide-react';

const ResetPassword: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { toast } = useToast();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('A senha deve ter ao menos 8 caracteres.');
    if (password !== confirm) return setError('As senhas não conferem.');
    setError(null);

    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      toast({ title: res.message });
      navigate('/login');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Link inválido" description="Este link de redefinição está incompleto.">
        <Button asChild className="w-full">
          <Link to="/esqueci-senha">Pedir um novo link</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Nova senha" description="Escolha uma senha com pelo menos 8 caracteres">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nova senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirme a senha</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-11"
          />
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}{' '}
            {error.includes('expirado') && (
              <Link to="/esqueci-senha" className="underline">Pedir um novo link</Link>
            )}
          </p>
        )}
        <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar nova senha
        </Button>
      </form>
    </AuthShell>
  );
};

export default ResetPassword;
