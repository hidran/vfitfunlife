import { createRef } from 'react';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BusinessDetailsForm, type BusinessDetailsFormHandle } from './BusinessDetailsForm';
import { isValidItalianVat } from '@/lib/vatNumber';
import {
  PROVIDER_APPLICATION_ERROR_CODES,
  PROVIDER_APPLICATION_ERRORS,
} from '@/lib/providerApplicationErrors';
import { itMessages } from '@/i18n/messages/it';
import type { BusinessApplicationInput } from '@/lib/firebase/providerApplication';

const VALID_PIVA = '00743110157';
// An association's (ASD) numeric codice fiscale: same checksum as a P.IVA (decision D3).
const ASSOCIATION_CF = '97123456788';

function setup() {
  const ref = createRef<BusinessDetailsFormHandle>();
  render(<BusinessDetailsForm ref={ref} />);
  return { ref };
}

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: RegExp, value: string) => fireEvent.change(field(label), { target: { value } });

/** A company with premises (the default) must give an address and a city. */
const fillPremises = () => {
  type(/^Indirizzo/, 'Via Roma 1');
  type(/^Città/, 'Roma');
};

async function validate(ref: React.RefObject<BusinessDetailsFormHandle | null>) {
  let result: BusinessApplicationInput | null | undefined;
  await act(async () => {
    result = await ref.current!.validate();
  });
  return result;
}

describe('BusinessDetailsForm', () => {
  it('labels every field and describes the tax id with its help text', () => {
    setup();

    expect(screen.getByRole('group', { name: "Dati dell'attività" })).toBeInTheDocument();
    for (const label of [
      /^Ragione sociale/,
      /^P\.IVA \/ Codice fiscale/,
      /^Forma giuridica/,
      /^Numero di affiliazione/,
      /^Nome pubblico/,
      /^Tipo di sede/,
      /^Indirizzo/,
      /^Città/,
      /^Sito web/,
      /^Descrizione/,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }

    const vat = field(/^P\.IVA \/ Codice fiscale/);
    expect(vat).toHaveAttribute('inputmode', 'numeric');
    expect(vat).toHaveAccessibleDescription(/associazioni senza P\.IVA inseriscono il codice fiscale/);
    expect(field(/^Forma giuridica/)).toHaveValue('company');
    // Premises (B12): a gym by default, so an address and a city are asked for.
    expect(field(/^Tipo di sede/)).toHaveValue('gym');
    expect(field(/^Indirizzo/)).toHaveAttribute('aria-required', 'true');
    expect(field(/^Città/)).toHaveAttribute('aria-required', 'true');
    expect(
      Array.from(field(/^Tipo di sede/).querySelectorAll('option')).map((o) => [o.value, o.textContent])
    ).toEqual([
      ['gym', 'Palestra'],
      ['school', 'Scuola'],
      ['studio', 'Studio'],
      ['none', 'Nessuna sede fissa'],
    ]);
  });

  it('requires the legal name and the tax id, showing the errors and focusing the first', async () => {
    const { ref } = setup();

    expect(await validate(ref)).toBeNull();

    const legalName = field(/^Ragione sociale/);
    const vat = field(/^P\.IVA \/ Codice fiscale/);
    await waitFor(() => expect(legalName).toHaveFocus());
    expect(legalName).toHaveAttribute('aria-invalid', 'true');
    expect(legalName).toHaveAccessibleDescription('Inserisci la ragione sociale.');
    expect(vat).toHaveAccessibleDescription(/Inserisci la P\.IVA o il codice fiscale\./);
    // A gym by default: the premises are required too.
    expect(field(/^Indirizzo/)).toHaveAccessibleDescription("L'indirizzo è obbligatorio per una sede");
    expect(field(/^Città/)).toHaveAccessibleDescription('La città è obbligatoria per una sede');
    // Errors are announced: each sits in a polite live region.
    expect(screen.getByText('Inserisci la ragione sociale.').closest('[aria-live]')).toHaveAttribute(
      'aria-live',
      'polite'
    );
  });

  it('rejects a tax id with a wrong check digit', async () => {
    const { ref } = setup();
    type(/^Ragione sociale/, 'Karate Club Roma');
    type(/^P\.IVA \/ Codice fiscale/, '12345678904');

    expect(await validate(ref)).toBeNull();

    const vat = field(/^P\.IVA \/ Codice fiscale/);
    await waitFor(() => expect(vat).toHaveFocus());
    expect(screen.getByText('P.IVA o codice fiscale non valido: controlla le 11 cifre.')).toBeInTheDocument();
  });

  it('accepts a valid P.IVA, sent as bare digits, and defaults the public name to the legal name', async () => {
    const { ref } = setup();
    type(/^Ragione sociale/, '  Karate Club Roma SRL ');
    type(/^P\.IVA \/ Codice fiscale/, 'IT 007 4311 0157');
    type(/^Indirizzo/, ' Via Roma 1 ');
    type(/^Città/, 'Roma');

    expect(await validate(ref)).toEqual({
      legalName: 'Karate Club Roma SRL',
      vatNumber: VALID_PIVA,
      legalForm: 'company',
      displayName: 'Karate Club Roma SRL',
      venueType: 'gym',
      address: 'Via Roma 1',
      city: 'Roma',
    });
  });

  it("accepts an association's codice fiscale as the tax id", async () => {
    expect(isValidItalianVat(ASSOCIATION_CF)).toBe(true);
    const { ref } = setup();
    type(/^Ragione sociale/, 'ASD Karate Roma');
    type(/^P\.IVA \/ Codice fiscale/, ASSOCIATION_CF);
    fireEvent.change(field(/^Forma giuridica/), { target: { value: 'association' } });
    type(/^Numero di affiliazione/, ' CONI 12345 ');
    fillPremises();

    expect(await validate(ref)).toEqual({
      legalName: 'ASD Karate Roma',
      vatNumber: ASSOCIATION_CF,
      legalForm: 'association',
      affiliationNumber: 'CONI 12345',
      displayName: 'ASD Karate Roma',
      venueType: 'gym',
      address: 'Via Roma 1',
      city: 'Roma',
    });
  });

  it('keeps an explicit public name and sends every optional field trimmed', async () => {
    const { ref } = setup();
    type(/^Ragione sociale/, 'Fit Lab SRL');
    type(/^P\.IVA \/ Codice fiscale/, VALID_PIVA);
    type(/^Nome pubblico/, ' Fit Lab ');
    fireEvent.change(field(/^Tipo di sede/), { target: { value: 'school' } });
    type(/^Indirizzo/, ' Via Torino 5 ');
    type(/^Città/, ' Roma ');
    type(/^Descrizione/, ' Karate e animazione per bambini ');

    expect(await validate(ref)).toEqual({
      legalName: 'Fit Lab SRL',
      vatNumber: VALID_PIVA,
      legalForm: 'company',
      displayName: 'Fit Lab',
      venueType: 'school',
      address: 'Via Torino 5',
      city: 'Roma',
      description: 'Karate e animazione per bambini',
    });
  });

  it.each([
    ['www.karateroma.it', 'https://www.karateroma.it'],
    ['karateroma.it/corsi', 'https://karateroma.it/corsi'],
    ['http://karateroma.it', 'http://karateroma.it'],
    ['HTTPS://Karateroma.it', 'https://Karateroma.it'],
  ])('normalises the website %s to %s', async (typed, sent) => {
    const { ref } = setup();
    type(/^Ragione sociale/, 'Fit Lab SRL');
    type(/^P\.IVA \/ Codice fiscale/, VALID_PIVA);
    fillPremises();
    type(/^Sito web/, typed);

    expect((await validate(ref))?.website).toBe(sent);
  });

  it.each(['javascript:alert(1)', 'mailto:info@karateroma.it', 'ftp://karateroma.it', 'karate roma', 'localhost'])(
    'refuses the website %s',
    async (typed) => {
      const { ref } = setup();
      type(/^Ragione sociale/, 'Fit Lab SRL');
      type(/^P\.IVA \/ Codice fiscale/, VALID_PIVA);
      fillPremises();
      type(/^Sito web/, typed);

      expect(await validate(ref)).toBeNull();
      await waitFor(() => expect(field(/^Sito web/)).toHaveFocus());
      expect(field(/^Sito web/)).toHaveAccessibleDescription(
        'Indirizzo del sito non valido. Esempio: www.tuosito.it'
      );
    }
  );

  it('lets a long bare address be typed and says it is too long once https:// is added', async () => {
    const { ref } = setup();
    type(/^Ragione sociale/, 'Fit Lab SRL');
    type(/^P\.IVA \/ Codice fiscale/, VALID_PIVA);
    fillPremises();
    // 196 characters typed; with `https://` that is 204, over the 200 the server accepts.
    const typed = `www.${'a'.repeat(189)}.it`;
    expect(typed).toHaveLength(196);
    expect(field(/^Sito web/)).not.toHaveAttribute('maxlength');
    type(/^Sito web/, typed);

    expect(await validate(ref)).toBeNull();
    expect(field(/^Sito web/)).toHaveValue(typed);
    expect(field(/^Sito web/)).toHaveAccessibleDescription(
      'Indirizzo del sito troppo lungo (massimo 200 caratteri).'
    );
  });

  describe('premises (B12)', () => {
    it('drops the address field and the city requirement for a company without premises', async () => {
      const { ref } = setup();
      type(/^Ragione sociale/, 'Fit Lab SRL');
      type(/^P\.IVA \/ Codice fiscale/, VALID_PIVA);
      fireEvent.change(field(/^Tipo di sede/), { target: { value: 'none' } });

      expect(screen.queryByLabelText(/^Indirizzo/)).toBeNull();
      expect(screen.getByLabelText(/^Città/)).not.toHaveAttribute('aria-required');
      expect(screen.getByText('Città (opzionale)')).toBeInTheDocument();

      expect(await validate(ref)).toEqual({
        legalName: 'Fit Lab SRL',
        vatNumber: VALID_PIVA,
        legalForm: 'company',
        displayName: 'Fit Lab SRL',
        venueType: 'none',
      });
    });

    it('does not send an address typed before switching to no premises', async () => {
      const { ref } = setup();
      type(/^Ragione sociale/, 'Fit Lab SRL');
      type(/^P\.IVA \/ Codice fiscale/, VALID_PIVA);
      type(/^Indirizzo/, 'Via Roma 1');
      fireEvent.change(field(/^Tipo di sede/), { target: { value: 'none' } });

      expect(await validate(ref)).not.toHaveProperty('address');
    });

    it('clears the address and city errors when the company turns out to have no premises', async () => {
      const { ref } = setup();
      type(/^Ragione sociale/, 'Fit Lab SRL');
      type(/^P\.IVA \/ Codice fiscale/, VALID_PIVA);
      expect(await validate(ref)).toBeNull();
      expect(await screen.findByText("L'indirizzo è obbligatorio per una sede")).toBeInTheDocument();
      expect(screen.getByText('La città è obbligatoria per una sede')).toBeInTheDocument();

      fireEvent.change(field(/^Tipo di sede/), { target: { value: 'none' } });
      await waitFor(() => expect(screen.queryByText('La città è obbligatoria per una sede')).toBeNull());
      expect(screen.queryByText("L'indirizzo è obbligatorio per una sede")).toBeNull();
    });

    it('focuses the address (before the city) when both are missing', async () => {
      const { ref } = setup();
      type(/^Ragione sociale/, 'Fit Lab SRL');
      type(/^P\.IVA \/ Codice fiscale/, VALID_PIVA);
      expect(await validate(ref)).toBeNull();
      await waitFor(() => expect(field(/^Indirizzo/)).toHaveFocus());
    });

    it('sends a studio with its address', async () => {
      const { ref } = setup();
      type(/^Ragione sociale/, 'Fit Lab SRL');
      type(/^P\.IVA \/ Codice fiscale/, VALID_PIVA);
      fireEvent.change(field(/^Tipo di sede/), { target: { value: 'studio' } });
      fillPremises();

      expect(await validate(ref)).toMatchObject({ venueType: 'studio', address: 'Via Roma 1', city: 'Roma' });
    });
  });

  it('does not take focus while disabled, and focuses the first invalid field once enabled', async () => {
    const ref = createRef<BusinessDetailsFormHandle>();
    const { rerender } = render(<BusinessDetailsForm ref={ref} disabled />);

    expect(await validate(ref)).toBeNull();
    expect(field(/^Ragione sociale/)).not.toHaveFocus();

    rerender(<BusinessDetailsForm ref={ref} />);
    await waitFor(() => expect(field(/^Ragione sociale/)).toHaveFocus());
  });

  describe('server error codes', () => {
    const fieldCodes = PROVIDER_APPLICATION_ERROR_CODES.filter((code) => PROVIDER_APPLICATION_ERRORS[code].field);
    const formCodes = PROVIDER_APPLICATION_ERROR_CODES.filter((code) => !PROVIDER_APPLICATION_ERRORS[code].field);

    const LABEL_OF = {
      legalName: /^Ragione sociale/,
      vatNumber: /^P\.IVA \/ Codice fiscale/,
      legalForm: /^Forma giuridica/,
      affiliationNumber: /^Numero di affiliazione/,
      displayName: /^Nome pubblico/,
      venueType: /^Tipo di sede/,
      address: /^Indirizzo/,
      city: /^Città/,
      website: /^Sito web/,
      description: /^Descrizione/,
    } as const;

    it.each(fieldCodes)('shows %s on its field, localised, and focuses it', async (code) => {
      const { ref } = setup();
      const { field: name, messageKey } = PROVIDER_APPLICATION_ERRORS[code];
      const control = field(LABEL_OF[name!]);

      let shown = false;
      act(() => {
        shown = ref.current!.showServerError(code);
      });

      expect(shown).toBe(true);
      await waitFor(() => expect(control).toHaveFocus());
      expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(control).toHaveAccessibleDescription(expect.stringContaining(itMessages[messageKey]));
      expect(screen.queryByText(code)).toBeNull();
    });

    it('puts a duplicate tax id on the tax id field', async () => {
      const { ref } = setup();
      act(() => {
        ref.current!.showServerError('vat_already_registered');
      });
      await waitFor(() =>
        expect(field(/^P\.IVA \/ Codice fiscale/)).toHaveAccessibleDescription(
          expect.stringContaining('già registrato da un altro account')
        )
      );
    });

    it('clears a server error once the field is edited into a valid value', async () => {
      const { ref } = setup();
      type(/^Ragione sociale/, 'Fit Lab SRL');
      type(/^P\.IVA \/ Codice fiscale/, VALID_PIVA);
      fillPremises();
      expect(await validate(ref)).not.toBeNull();

      act(() => {
        ref.current!.showServerError('vat_already_registered');
      });
      expect(await screen.findByText(/già registrato da un altro account/)).toBeInTheDocument();

      type(/^P\.IVA \/ Codice fiscale/, '12345678903');
      await waitFor(() => expect(screen.queryByText(/già registrato da un altro account/)).toBeNull());
    });

    it.each(formCodes)('leaves %s to the caller (no field)', (code) => {
      const { ref } = setup();
      let shown = true;
      act(() => {
        shown = ref.current!.showServerError(code);
      });
      expect(shown).toBe(false);
      expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    });
  });

  describe('edit mode (company profile, B6)', () => {
    const STORED = {
      legalName: 'Karate Club Roma SRL',
      vatNumber: VALID_PIVA,
      legalForm: 'company' as const,
      affiliationNumber: '',
      displayName: 'Karate Club Roma',
      venueType: 'school' as const,
      address: 'Via Roma 1',
      city: 'Roma',
      website: 'https://karateroma.it',
      description: '',
    };

    async function validateChanges(ref: React.RefObject<BusinessDetailsFormHandle | null>) {
      let result: Awaited<ReturnType<BusinessDetailsFormHandle['validateChanges']>> | undefined;
      await act(async () => {
        result = await ref.current!.validateChanges();
      });
      return result;
    }

    it('hides an empty affiliation number and offers no reviewed field as a control', () => {
      render(<BusinessDetailsForm mode="edit" defaultValues={STORED} />);
      expect(screen.queryByText('Numero di affiliazione')).toBeNull();
      expect(screen.getByText('Karate Club Roma SRL')).toBeInTheDocument();
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(field(/^Nome pubblico \*/)).toHaveValue('Karate Club Roma');
    });

    it('shows the venue type and address with the reviewed fields: read-only text, no control', () => {
      render(<BusinessDetailsForm mode="edit" defaultValues={STORED} />);
      const dl = screen.getByText('Karate Club Roma SRL').closest('dl') as HTMLElement;
      expect(within(dl).getByText('Tipo di sede').nextElementSibling).toHaveTextContent('Scuola');
      expect(within(dl).getByText('Indirizzo').nextElementSibling).toHaveTextContent('Via Roma 1');
      expect(screen.queryByLabelText(/^Tipo di sede/)).toBeNull();
      expect(screen.queryByLabelText(/^Indirizzo/)).toBeNull();
      // The city is an owner-editable display field, and optional once the venue exists.
      expect(field(/^Città/)).not.toHaveAttribute('aria-required');
    });

    it('shows no venue rows for a company stored without a venue type or address', () => {
      render(<BusinessDetailsForm mode="edit" defaultValues={{ ...STORED, venueType: '', address: '' }} />);
      const dl = screen.getByText('Karate Club Roma SRL').closest('dl') as HTMLElement;
      expect(within(dl).queryByText('Tipo di sede')).toBeNull();
      expect(within(dl).queryByText('Indirizzo')).toBeNull();
    });

    it('shows a company without premises as such, with no address', () => {
      render(<BusinessDetailsForm mode="edit" defaultValues={{ ...STORED, venueType: 'none', address: '' }} />);
      const dl = screen.getByText('Karate Club Roma SRL').closest('dl') as HTMLElement;
      expect(within(dl).getByText('Tipo di sede').nextElementSibling).toHaveTextContent('Nessuna sede fissa');
      expect(within(dl).queryByText('Indirizzo')).toBeNull();
    });

    it('never offers the venue type or address as a change, even when the stored city is empty', async () => {
      const ref = createRef<BusinessDetailsFormHandle>();
      render(<BusinessDetailsForm ref={ref} mode="edit" defaultValues={{ ...STORED, city: '' }} />);
      type(/^Nome pubblico/, 'Karate Roma');
      const changes = await validateChanges(ref);
      expect(changes).toEqual({ displayName: 'Karate Roma' });
      expect(changes).not.toHaveProperty('venueType');
      expect(changes).not.toHaveProperty('address');
    });

    it('returns only the fields that changed, and nothing once they are marked saved', async () => {
      const ref = createRef<BusinessDetailsFormHandle>();
      const onDirtyChange = vi.fn();
      render(<BusinessDetailsForm ref={ref} mode="edit" defaultValues={STORED} onDirtyChange={onDirtyChange} />);

      type(/^Città/, ' Milano ');
      await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
      expect(await validateChanges(ref)).toEqual({ city: 'Milano' });

      act(() => ref.current!.markSaved());
      await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
      expect(field(/^Città/)).toHaveValue('Milano');
      expect(await validateChanges(ref)).toEqual({});
    });

    it('waits until a hidden form is shown before focusing the first invalid field', async () => {
      const ref = createRef<BusinessDetailsFormHandle>();
      const { rerender } = render(
        <div hidden>
          <BusinessDetailsForm ref={ref} mode="edit" defaultValues={STORED} />
        </div>
      );
      type(/^Nome pubblico/, '');

      expect(await validateChanges(ref)).toBeNull();
      // The error has rendered (so the focus effect has run) while the form is hidden.
      expect(await screen.findByText('Inserisci il nome pubblico.')).toBeInTheDocument();
      expect(field(/^Nome pubblico/)).not.toHaveFocus();

      rerender(
        <div>
          <BusinessDetailsForm ref={ref} mode="edit" defaultValues={STORED} />
        </div>
      );
      await waitFor(() => expect(field(/^Nome pubblico/)).toHaveFocus());
    });
  });
});
