import { useState } from 'react';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

export const useDateRangeFilter = () => {
  // Awal & akhir hari, sama seperti preset "Hari Ini", supaya label "Hari Ini" cocok di keadaan awal.
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => endOfDay(new Date()));

  const setPeriod = (period: 'today' | 'week' | 'month') => {
    const now = new Date();
    
    switch (period) {
      case 'today':
        setStartDate(startOfDay(now));
        setEndDate(endOfDay(now));
        break;
      case 'week':
        setStartDate(startOfWeek(now, { weekStartsOn: 1 }));
        setEndDate(endOfWeek(now, { weekStartsOn: 1 }));
        break;
      case 'month':
        setStartDate(startOfMonth(now));
        setEndDate(endOfMonth(now));
        break;
    }
  };

  const getPeriodLabel = () => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    if (startDate.getTime() === todayStart.getTime() && endDate.getTime() === todayEnd.getTime()) {
      return 'Hari Ini';
    }
    
    if (startDate.getTime() === weekStart.getTime() && endDate.getTime() === weekEnd.getTime()) {
      return 'Minggu Ini';
    }
    
    if (startDate.getTime() === monthStart.getTime() && endDate.getTime() === monthEnd.getTime()) {
      return 'Bulan Ini';
    }
    
    return `${format(startDate, 'dd MMM', { locale: localeId })} - ${format(endDate, 'dd MMM yyyy', { locale: localeId })}`;
  };

  return {
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    setPeriod,
    getPeriodLabel
  };
};
