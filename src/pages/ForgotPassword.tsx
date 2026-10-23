import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell } from '@/components/common/AuthShell';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { Loader2, MailCheck } from 'lucide-react';

const ForgotPassword: React.FC = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSentMessage(res.message);
    } catch (error) {
      toast({ title: 'Não foi possível enviar', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell title="Recuperar senha" description="Enviaremos um link para você criar uma nova senha">
      {sentMessage ? (
        <div className="space-y-4 text-center">
          <MailCheck className="h-10 w-10 text-success mx-auto" />
          <p className="text-sm" role="status">{sentMessage}</p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Voltar para o login</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
              disabled={isSubmitting}
            />
          </div>
          <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar link
          </Button>
          <Link to="/login" className="block text-center text-sm text-muted-foreground hover:underline">
            Voltar para o login
          </Link>
        </form>
      )}
    </AuthShell>
  );
};

export default ForgotPassword;
