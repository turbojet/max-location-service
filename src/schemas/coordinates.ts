import { z } from 'zod';

const COORDINATE_REGEX = /^x=(\d+),y=(\d+)$/;

export type Coordinates = {
  x: number;
  y: number;
};

export const CoordinatesStringSchema = z
  .string()
  .regex(COORDINATE_REGEX, "must match 'x=N,y=N' with non-negative integers")
  .transform((value, ctx): Coordinates => {
    const match = COORDINATE_REGEX.exec(value);
    if (!match) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "must match 'x=N,y=N' with non-negative integers",
      });
      return z.NEVER;
    }
    const x = Number(match[1]);
    const y = Number(match[2]);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'coordinate values exceed safe integer range',
      });
      return z.NEVER;
    }
    return { x, y };
  });

export function serializeCoordinates({ x, y }: Coordinates): string {
  return `x=${x.toString()},y=${y.toString()}`;
}
