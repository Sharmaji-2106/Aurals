import createClient, { type Middleware } from "openapi-fetch";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type Me = Schemas["MeOut"];
export type Journey = Schemas["Journey"];
export type Profile = Schemas["ProfileOut"];
export type ProfileUpdate = Schemas["ProfileUpdate"];
export type Submission = Schemas["SubmissionOut"];
export type SubmissionTrack = Schemas["SubmissionTrackOut"];
export type LinkPreview = Schemas["LinkPreviewOut"];
export type Stage = Schemas["Stage"];
export type MusicProfile = Schemas["MusicProfileOut"];
export type MusicProfileData = Schemas["MusicProfileData"];
export type SoundProfile = Schemas["SoundProfileOut"];
export type SoundProfileData = Schemas["SoundProfileData"];
export type Dimension = Schemas["Dimension"];
export type Questionnaire = Schemas["Questionnaire"];
export type Question = Schemas["Question"];
export type UrlProblem = { index: number; url: string; code: string; message: string };

/** Error shape returned by the API: `{ error: { code, message, ... } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  get problems(): UrlProblem[] {
    return (this.details.problems as UrlProblem[] | undefined) ?? [];
  }
}

// State-changing requests must carry this header (see backend CSRF middleware).
const clientHeader: Middleware = {
  onRequest({ request }) {
    request.headers.set("x-auralis-client", "web");
    return request;
  },
};

export const api = createClient<paths>({ baseUrl: "", credentials: "same-origin" });
api.use(clientHeader);

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Return data or throw a typed ApiError. */
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  let result: Result<T>;
  try {
    result = await promise;
  } catch {
    throw new ApiError(0, "network", "Can't reach AURALS. Check your connection.");
  }
  const { data, error, response } = result;
  if (response.ok) return data as T;
  const body = (error ?? {}) as { error?: { code?: string; message?: string } };
  const { code = "unknown", message = "Something went wrong.", ...rest } = body.error ?? {};
  throw new ApiError(
    response.status,
    code,
    response.status >= 500 ? "Something went wrong on our side. Please try again." : message,
    rest,
  );
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}
export type SoundPreview = Schemas["SoundProfilePreview"];
export type CurvePoint = Schemas["CurvePoint"];
export type Recommendations = Schemas["RecommendationsOut"];
export type Recommendation = Schemas["Recommendation"];
export type Reviews = Schemas["ReviewsOut"];
export type ReviewSource = Schemas["Source"];
export type ReviewClaim = Schemas["Claim"];
export type ReviewTopic = Schemas["TopicOut"];
