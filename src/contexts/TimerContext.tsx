import { createContext, useContext, useState, ReactNode } from 'react';

interface TimerContextType {
  isTimerActive: boolean;
  setTimerActive: (active: boolean) => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

export function TimerProvider({ children }: { children: ReactNode }) {
  const [isTimerActive, setIsTimerActive] = useState(false);

  return (
    <TimerContext.Provider value={{ isTimerActive, setTimerActive: setIsTimerActive }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (context === undefined) {
    throw new Error('useTimer must be used within a TimerProvider');
  }
  return context;
}

