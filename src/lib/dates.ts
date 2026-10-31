import { format, parseISO } from "date-fns";

/** "2026-11-03" -> "Tue, 3 Nov 2026" */
export const prettyDate = (date: string) => format(parseISO(date), "EEE, d MMM yyyy");
