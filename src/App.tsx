import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { MainLayout } from "@/components/layout/MainLayout";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Trips from "@/pages/Trips";
import TripDetail from "@/pages/TripDetail";
import Customers from "@/pages/Customers";
import Users from "@/pages/Users";
import Vehicles from "@/pages/Vehicles";
import Accommodations from "@/pages/Accommodations";
import PassengerPage from "@/pages/PassengerPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/esqueci-senha" element={<ForgotPassword />} />
            <Route path="/redefinir-senha" element={<ResetPassword />} />
            <Route path="/p/:token" element={<PassengerPage />} />
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/viagens" replace />} />
              <Route path="viagens" element={<Trips />} />
              <Route path="viagens/:id" element={<TripDetail />} />
              <Route path="viagens/:id/:module" element={<TripDetail />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="veiculos" element={<Vehicles />} />
              <Route path="pousadas" element={<Accommodations />} />
              <Route path="usuarios" element={<Users />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
