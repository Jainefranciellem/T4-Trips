import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Logo } from '@/components/common/Logo';
import { Skeleton } from '@/components/ui/skeleton';
import { getPublicReservation } from '@/lib/reservations.service';
import { formatDateTime } from '@/lib/format';
import { BedDouble, Bus, CalendarDays, Info, ListChecks, MapPin } from 'lucide-react';

function Section({ icon: Icon, title, children }: { icon: typeof Bus; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-card border p-5 space-y-2">
      <h2 className="flex items-center gap-2 font-semibold">
        <Icon className="h-5 w-5 text-primary" aria-hidden /> {title}
      </h2>
      <div className="text-sm space-y-1">{children}</div>
    </section>
  );
}

// Página pública do passageiro (RF-015): só dados públicos, sem login.
const PassengerPage = () => {
  const { token = '' } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-reservation', token],
    queryFn: () => getPublicReservation(token),
    retry: false,
    // Mudanças de assento/quarto feitas pela equipe aparecem ao voltar pra aba.
    refetchOnWindowFocus: true,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-secondary text-white px-4 py-5">
        <div className="max-w-lg mx-auto">
          <Logo subtitle={false} />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </>
        ) : isError || !data ? (
          <div className="rounded-2xl bg-card border p-6 text-center space-y-2" role="alert">
            <p className="font-semibold">Este link não está disponível.</p>
            <p className="text-sm text-muted-foreground">Ele pode ter sido substituído ou desativado. Fale com a equipe da T4 Trips para receber um novo.</p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-sm text-muted-foreground">Olá, {data.passenger_name.split(' ')[0]}!</p>
              <h1 className="text-2xl font-bold">{data.trip.name}</h1>
              <p className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-4 w-4" aria-hidden /> {data.trip.destination}
              </p>
            </div>

            {data.waitlist && (
              <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm" role="status">
                Você está na <strong>lista de espera</strong>. Avisaremos assim que uma vaga abrir.
              </div>
            )}

            <Section icon={CalendarDays} title="Saída e retorno">
              <p>
                <span className="text-muted-foreground">Saída: </span>
                {formatDateTime(data.trip.departure_at)}
              </p>
              <p>
                <span className="text-muted-foreground">Local de embarque: </span>
                {data.trip.departure_location}
              </p>
              <p>
                <span className="text-muted-foreground">Retorno: </span>
                {formatDateTime(data.trip.return_at)}
              </p>
            </Section>

            <Section icon={Bus} title="Transporte">
              {data.transport ? (
                <>
                  <p>
                    <span className="text-muted-foreground">Veículo: </span>
                    {data.transport.vehicle}
                    {data.transport.identifier && ` (${data.transport.identifier})`}
                  </p>
                  <p className="text-lg">
                    <span className="text-muted-foreground text-sm">Seu assento: </span>
                    <strong>{data.transport.seat_number}</strong>
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">Veículo e assento serão informados aqui.</p>
              )}
            </Section>

            <Section icon={BedDouble} title="Hospedagem">
              {data.accommodation ? (
                <>
                  <p className="font-medium">{data.accommodation.name}</p>
                  {(data.accommodation.address || data.accommodation.city) && (
                    <p className="text-muted-foreground">
                      {[data.accommodation.address, [data.accommodation.city, data.accommodation.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p className="text-lg">
                    <span className="text-muted-foreground text-sm">Seu quarto: </span>
                    <strong>{data.accommodation.room}</strong>
                    {data.accommodation.room_name && <span className="text-sm text-muted-foreground"> · {data.accommodation.room_name}</span>}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">Pousada e quarto serão informados aqui.</p>
              )}
            </Section>

            {data.trip.included_services && (
              <Section icon={ListChecks} title="Incluso no pacote">
                <p className="whitespace-pre-line">{data.trip.included_services}</p>
              </Section>
            )}

            {data.trip.public_instructions && (
              <Section icon={Info} title="Orientações">
                <p className="whitespace-pre-line">{data.trip.public_instructions}</p>
              </Section>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default PassengerPage;
