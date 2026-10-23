import { apiFetch } from './api';
import type { ItineraryItem, PricingDefaults, PricingScenario, PricingScenarioInput } from '@/types';

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

// Simulador: sem tripId = cenários independentes.
export const listScenarios = (tripId: string | null) =>
  apiFetch<PricingScenario[]>(tripId ? `/trips/${tripId}/pricing-scenarios` : '/pricing-scenarios');
export const createScenario = (tripId: string | null, payload: PricingScenarioInput) =>
  apiFetch<PricingScenario>(tripId ? `/trips/${tripId}/pricing-scenarios` : '/pricing-scenarios', json('POST', payload));
export const updateScenario = (id: string, payload: Partial<PricingScenarioInput>) => apiFetch<PricingScenario>(`/pricing-scenarios/${id}`, json('PATCH', payload));
export const deleteScenario = (id: string) => apiFetch<void>(`/pricing-scenarios/${id}`, json('DELETE'));
export const applyScenario = (id: string) => apiFetch<{ default_package_price: number }>(`/pricing-scenarios/${id}/apply`, json('POST'));
export const getPricingDefaults = (tripId: string) => apiFetch<PricingDefaults>(`/trips/${tripId}/pricing-defaults`);

export type ItineraryInput = Omit<ItineraryItem, 'id' | 'trip_id' | 'sort_order'>;
export const listItinerary = (tripId: string) => apiFetch<ItineraryItem[]>(`/trips/${tripId}/itinerary`);
export const createItineraryItem = (tripId: string, payload: ItineraryInput) => apiFetch<ItineraryItem[]>(`/trips/${tripId}/itinerary`, json('POST', payload));
export const updateItineraryItem = (id: string, payload: Partial<ItineraryInput>) => apiFetch<ItineraryItem[]>(`/itinerary-items/${id}`, json('PATCH', payload));
export const deleteItineraryItem = (id: string) => apiFetch<ItineraryItem[]>(`/itinerary-items/${id}`, json('DELETE'));
export const reorderItinerary = (tripId: string, ids: string[]) => apiFetch<ItineraryItem[]>(`/trips/${tripId}/itinerary/reorder`, json('POST', { ids }));
