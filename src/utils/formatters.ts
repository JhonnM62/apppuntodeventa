export const formatCurrency = (val: any): string => {
  if (val === null || val === undefined || val === '') return '';
  const numStr = val.toString().replace(/[^0-9]/g, '');
  if (!numStr) return '';
  return `$ ${numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
};

export const parseCurrency = (val: string): string => {
  if (!val) return '';
  return val.replace(/[^0-9]/g, '');
};

export const formatDateToReadable = (dateString: string | Date): string => {
  if (!dateString) return '';
  let date: Date;
  if (typeof dateString === 'string' && dateString.includes('-')) {
    const datePart = dateString.split('T')[0];
    const [year, month, day] = datePart.split('-');
    date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  } else {
    date = new Date(dateString);
  }
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  };
  // Output example: "lunes, 12 de mayo de 2026"
  const formatted = date.toLocaleDateString('es-CO', options);
  // Capitalize first letter
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

export const formatTime12h = (timeStr: string | null | undefined): string => {
  if (!timeStr) return '';
  if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) return timeStr;
  
  // Handle ISO strings by converting to local time
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12;
      const paddedHour = h < 10 ? '0' + h : h.toString();
      return `${paddedHour}:${m} ${ampm}`;
    }
  }

  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  
  let hour = parseInt(parts[0], 10);
  const minute = parts[1];
  
  if (isNaN(hour)) return timeStr;
  
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  hour = hour ? hour : 12;
  
  const paddedHour = hour < 10 ? '0' + hour : hour.toString();
  return `${paddedHour}:${minute} ${ampm}`;
};

export const formatDateToDDMMAAAA = (dateString: string): string => {
  if (!dateString) return '';
  try {
    const parts = dateString.split('-');
    if (parts.length === 3) {
      // Assuming YYYY-MM-DD
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (error) {
    return dateString;
  }
};
