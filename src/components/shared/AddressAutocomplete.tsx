import { useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';

interface AddressResult {
  address: string;
  lat: number;
  lng: number;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
}

declare global {
  interface Window {
    google: typeof google;
    _mapsLoaded?: boolean;
    _mapsCallbacks?: (() => void)[];
  }
}

function loadMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (window._mapsLoaded) { resolve(); return; }
    if (!window._mapsCallbacks) window._mapsCallbacks = [];
    window._mapsCallbacks.push(resolve);
    if (document.getElementById('google-maps-script')) return;

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=_mapsReady`;
    script.async = true;
    document.head.appendChild(script);

    (window as unknown as Record<string, unknown>)['_mapsReady'] = () => {
      window._mapsLoaded = true;
      window._mapsCallbacks?.forEach(cb => cb());
      window._mapsCallbacks = [];
    };
  });
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Search address…',
  label,
  required,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
    if (!apiKey) return;

    loadMapsScript(apiKey).then(() => {
      if (!inputRef.current || autocompleteRef.current) return;

      const ac = new google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'gb' },
        fields: ['formatted_address', 'geometry'],
      });

      autocompleteRef.current = ac;

      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place.geometry?.location || !place.formatted_address) return;
        onSelect({
          address: place.formatted_address,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
      });
    });

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-xs font-bold text-slate-500 uppercase">
          {label}{required && ' *'}
        </label>
      )}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
        />
      </div>
    </div>
  );
}
