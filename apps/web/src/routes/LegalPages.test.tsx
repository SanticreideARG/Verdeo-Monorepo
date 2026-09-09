import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PrivacyPolicyPage } from './PrivacyPolicyPage.js';
import { TermsPage } from './TermsPage.js';

function renderAt(element: React.ReactElement) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

describe('política de privacidad', () => {
  it('responde lo que Google revisa sobre los datos de la cuenta', () => {
    renderAt(<PrivacyPolicyPage />);

    /*
     * El revisor de la pantalla de consentimiento busca exactamente esto: qué datos de Google se
     * reciben, para qué se usan y que no se usen para publicidad ni se vendan. Si alguien recorta
     * la sección, la verificación se rechaza y nadie se entera hasta semanas después.
     */
    expect(screen.getByRole('heading', { name: /datos obtenidos de google/i })).toBeTruthy();
    expect(screen.getByText(/no se usan para publicidad/i)).toBeTruthy();
    expect(screen.getByText(/openid, correo electrónico y perfil/i)).toBeTruthy();
    expect(screen.getByText(/myaccount\.google\.com\/permissions/i)).toBeTruthy();
  });

  it('lista a los proveedores que reciben datos', () => {
    renderAt(<PrivacyPolicyPage />);

    // Enumerarlos es lo que convierte "compartimos con proveedores" en algo verificable.
    for (const proveedor of [
      'Vercel Inc',
      'Neon Inc',
      'Supabase Inc',
      'Resend Inc',
      'Meta Platforms',
    ]) {
      expect(screen.getAllByText(new RegExp(proveedor, 'i')).length).toBeGreaterThan(0);
    }
  });

  it('lleva la fórmula que la Ley 25.326 exige sobre el derecho de acceso', () => {
    renderAt(<PrivacyPolicyPage />);

    expect(screen.getByText(/intervalos no inferiores a seis meses/i)).toBeTruthy();
    expect(screen.getByText(/Agencia de Acceso a la Información Pública/i)).toBeTruthy();
  });

  it('dice desde cuándo rige', () => {
    renderAt(<PrivacyPolicyPage />);

    // Lo primero que se pregunta de un texto legal es qué versión aceptó alguien.
    expect(screen.getByText(/vigente desde el/i)).toBeTruthy();
  });
});

describe('términos y condiciones', () => {
  it('advierte sobre alérgenos, que es lo que más importa vendiendo comida', () => {
    renderAt(<TermsPage />);

    expect(screen.getByRole('heading', { name: /alérgenos/i })).toBeTruthy();
    expect(screen.getByText(/no puede garantizarse la ausencia total/i)).toBeTruthy();
  });

  it('explica el derecho de revocación y por qué no alcanza a la comida fresca', () => {
    renderAt(<TermsPage />);

    // Decir sólo "no hay devoluciones" sería falso; decir sólo "tenés diez días" también.
    expect(screen.getByText(/diez días corridos/i)).toBeTruthy();
    expect(screen.getByText(/deteriorarse o caducar con rapidez/i)).toBeTruthy();
  });

  it('no renuncia a derechos irrenunciables del consumidor', () => {
    renderAt(<TermsPage />);

    expect(screen.getByText(/irrenunciables/i)).toBeTruthy();
  });
});
