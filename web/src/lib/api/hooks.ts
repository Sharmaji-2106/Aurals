"use client";

import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  isApiError,
  unwrap,
  type Journey,
  type ProfileUpdate,
  type Schemas,
  type Submission,
} from "./client";

export const keys = {
  me: ["me"] as const,
  submission: (id: string) => ["submission", id] as const,
  musicProfile: ["music-profile"] as const,
  soundProfile: ["sound-profile"] as const,
  questionnaire: ["questionnaire"] as const,
  researchRun: (id: string) => ["research-run", id] as const,
  latestResearchRun: ["research-run", "latest"] as const,
};

const ACTIVE = new Set(["queued", "resolving", "analyzing", "aggregating"]);

export function isActive(status: Submission["status"]) {
  return ACTIVE.has(status);
}

/** The signed-in listener, or `null` when there is no session. */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => (await unwrap(api.GET("/api/session"))).me ?? null,
    staleTime: 10_000,
  });
}

export function journeyHref(journey: Journey) {
  switch (journey.next_step) {
    case "add_music":
      return "/music";
    case "questionnaire":
      return "/tune";
    case "processing":
      return journey.active_submission_id ? `/analysis/${journey.active_submission_id}` : "/music";
    case "sound_profile":
      // The profile is shown on the results screen, beside the matches.
      return "/match";
  }
}

export function useStartSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) =>
      unwrap(api.POST("/api/session", { body: { display_name: displayName } })),
    onSuccess: (me) => qc.setQueryData(keys.me, me),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileUpdate) => unwrap(api.PATCH("/api/me/profile", { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/me")),
    onSuccess: () => qc.clear(),
  });
}

/** No playlist to hand: AURALS measures well-known songs from the named genres. */
export function useCreatePicks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (genres: Schemas["PicksCreate"]["genres"]) =>
      unwrap(api.POST("/api/music/picks", { body: { genres } })),
    onSuccess: (submission) => {
      qc.setQueryData(keys.submission(submission.id), submission);
      qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useCreateSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (urls: string[]) => unwrap(api.POST("/api/music/submissions", { body: { urls } })),
    onSuccess: (submission) => {
      qc.setQueryData(keys.submission(submission.id), submission);
      qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useSubmission(id: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.submission(id),
    queryFn: async () => {
      const submission = await unwrap(
        api.GET("/api/music/submissions/{submission_id}", {
          params: { path: { submission_id: id } },
        }),
      );
      if (!isActive(submission.status)) {
        qc.invalidateQueries({ queryKey: keys.me });
        qc.invalidateQueries({ queryKey: keys.musicProfile });
        qc.invalidateQueries({ queryKey: keys.soundProfile });
      }
      return submission;
    },
    // Poll while the pipeline is running; stop once it settles.
    //
    // Faster while the resolver works, because those first seconds decide when
    // the arrival sequence can begin, and a second and a half of polling lag on
    // top of the resolve is lag a person feels. Once it is analysing, nothing
    // changes quickly enough to be worth the traffic.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (query.state.error) return false;
      if (!data) return 400;
      if (!isActive(data.status)) return false;
      return data.status === "queued" || data.status === "resolving" ? 400 : 1500;
    },
    refetchIntervalInBackground: false,
    retry: (count, error) => !isApiError(error, 404) && count < 3,
  });
}

/* ------------------------------------------------------ community research --- */

/**
 * Watch a research run.
 *
 * Asks for the whole event log every poll rather than only what is new. The
 * endpoint supports `after_seq`, but a run emits a few dozen small events, and
 * re-reading them costs less than the bugs that come with accumulating a
 * stream in client state — a dropped poll, a remount or a second tab would all
 * have to be reconciled. Replacing the list wholesale means the client is
 * always showing exactly what the backend recorded.
 */
export function useResearchRun(id: string | null | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.researchRun(id ?? "none"),
    queryFn: async () => {
      const run = await unwrap(api.GET("/api/research/runs/{run_id}", { params: { path: { run_id: id! } } }));
      // Reviews gathered by the run are what the community section reads.
      if (run.finished) qc.invalidateQueries({ queryKey: ["reviews"] });
      return run;
    },
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (query.state.error) return false;
      return !data || !data.finished ? 1200 : false;
    },
    refetchIntervalInBackground: false,
    retry: (count, error) => !isApiError(error, 404) && count < 3,
  });
}

/** The most recent run, so a returning listener resumes rather than restarting. */
export function useLatestResearchRun(enabled = true) {
  return useQuery({
    queryKey: keys.latestResearchRun,
    queryFn: () => unwrap(api.GET("/api/research/latest")),
    enabled,
    staleTime: 10_000,
  });
}

/**
 * Begin research. Safe to call more than once: the endpoint returns the run
 * already in flight, and the job queue refuses a duplicate at the database.
 */
export function useStartResearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/research/runs")),
    onSuccess: (run) => {
      qc.setQueryData(keys.researchRun(run.id), run);
      qc.setQueryData(keys.latestResearchRun, run);
    },
  });
}

export function useMusicProfile(enabled = true) {
  return useQuery({
    queryKey: keys.musicProfile,
    queryFn: async () => {
      try {
        return await unwrap(api.GET("/api/music/profile"));
      } catch (error) {
        if (isApiError(error, 404)) return null;
        throw error;
      }
    },
    enabled,
  });
}

/** Measured IEMs ranked against the listener's personal target; keyed by profile version. */
export function useRecommendations(soundProfileId: string | undefined, limit = 5) {
  return useQuery({
    queryKey: ["recommendations", soundProfileId, limit],
    queryFn: () => unwrap(api.GET("/api/recommendations", { params: { query: { limit } } })),
    enabled: Boolean(soundProfileId),
    staleTime: 60_000,
  });
}

/** Published reviews gathered for one earphone, with the themes they support. */
export function useReviews(slug: string | undefined) {
  return useQuery({
    queryKey: ["reviews", slug],
    queryFn: () => unwrap(api.GET("/api/iems/{slug}/reviews", { params: { path: { slug: slug! } } })),
    enabled: Boolean(slug),
    staleTime: Infinity,
    retry: (count, error) => !isApiError(error, 404) && count < 2,
  });
}

/** Which earphones have review evidence, and which one the research tour opens on. */
export function useReviewCollections() {
  return useQuery({
    queryKey: ["reviews", "collections"],
    queryFn: () => unwrap(api.GET("/api/reviews/collections")),
    staleTime: Infinity,
  });
}

export function useSoundProfile(enabled = true) {
  return useQuery({
    queryKey: keys.soundProfile,
    queryFn: async () => {
      try {
        return await unwrap(api.GET("/api/sound-profile"));
      } catch (error) {
        if (isApiError(error, 404)) return null;
        throw error;
      }
    },
    enabled,
  });
}

export function useQuestionnaire() {
  return useQuery({
    queryKey: keys.questionnaire,
    queryFn: () => unwrap(api.GET("/api/questionnaire")),
    staleTime: Infinity,
  });
}

export function useSubmitAnswers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { version: string; answers: Record<string, string | null> }) =>
      unwrap(api.POST("/api/questionnaire/responses", { body })),
    onSuccess: (profile) => {
      qc.setQueryData(keys.soundProfile, profile);
      qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useLatestAnswers(enabled = true) {
  return useQuery({
    queryKey: ["questionnaire", "latest"],
    queryFn: async () => (await unwrap(api.GET("/api/questionnaire/responses/latest"))).response,
    enabled,
  });
}

/** Fuse draft answers with the latest music profile, without saving (for live shaping). */
export function useSoundPreview(answers: Record<string, string | null>, enabled = true) {
  return useQuery({
    queryKey: ["sound-preview", answers],
    queryFn: () => unwrap(api.POST("/api/sound-profile/preview", { body: { answers } })),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
}

/** Titles and artwork for pasted links (display only; the server re-validates on submit). */
export function useLinkPreviews(urls: string[]) {
  return useQueries({
    queries: urls.map((url) => ({
      queryKey: ["link-preview", url],
      queryFn: () => unwrap(api.GET("/api/music/link-preview", { params: { query: { url } } })),
      staleTime: Infinity,
      retry: false,
    })),
  });
}

/* ---------------------------------------------------------------- tuning --- */

export type TuningSessionIn = Schemas["TuningSessionIn"];
export type TuningShape = Schemas["Shape"];
export type TuningClip = Schemas["ClipOut"];
export type TuningSession = Schemas["TuningSessionOut"];

/** The sound shapes (V, U, warm…) as fixed curves, for the shape picker. */
export function useTuningShapes() {
  return useQuery({
    queryKey: ["tuning", "shapes"],
    queryFn: () => unwrap(api.GET("/api/tuning/shapes")),
    staleTime: Infinity,
  });
}

/** The best 20 seconds of the listener's most-watched song, prepared on request. */
export function useTuningClip(enabled = true) {
  return useQuery({
    queryKey: ["tuning", "clip"],
    queryFn: () => unwrap(api.GET("/api/tuning/clip")),
    enabled,
    staleTime: 30 * 60_000,
    retry: false,
  });
}

export type QuestionExamples = Schemas["ExamplesOut"];

/**
 * The questionnaire's examples from the listener's own songs. Asking starts
 * them being made (once per playlist; the server deduplicates), and the answer
 * is polled while they are made, for up to a few minutes.
 */
export function useQuestionExamples(enabled = true) {
  return useQuery({
    queryKey: ["tuning", "examples"],
    queryFn: () => unwrap(api.POST("/api/tuning/examples")),
    enabled,
    retry: false,
    staleTime: 10 * 60_000,
    refetchInterval: (query) =>
      query.state.data?.status === "preparing" && query.state.dataUpdateCount < 90 ? 2500 : false,
  });
}

export function useTuningDevices(q: string) {
  return useQuery({
    queryKey: ["tuning", "devices", q],
    queryFn: () => unwrap(api.GET("/api/tuning/devices", { params: { query: { q } } })),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export type TuningDevice = Schemas["DeviceOut"];
export type TuningDeviceDetail = Schemas["DeviceDetail"];

/** What most people are wearing, from the measured catalogue. */
export function usePopularDevices(headphones = false) {
  return useQuery({
    queryKey: ["tuning", "devices", "popular", headphones],
    queryFn: () => unwrap(api.GET("/api/tuning/devices/popular", { params: { query: { headphones } } })),
    staleTime: 30 * 60_000,
  });
}

/** One device, with how it already sounds against the target where that is known. */
export function useDeviceDetail(slug: string | null | undefined) {
  return useQuery({
    queryKey: ["tuning", "device", slug],
    queryFn: () => unwrap(api.GET("/api/tuning/devices/{slug}", { params: { path: { slug: slug! } } })),
    enabled: Boolean(slug),
    staleTime: 30 * 60_000,
  });
}

/** The listener's latest listening session, or `null` before they have taken one. */
export function useLatestTuning(enabled = true) {
  return useQuery({
    queryKey: ["tuning", "latest"],
    queryFn: async () => {
      try {
        return await unwrap(api.GET("/api/tuning/sessions/latest"));
      } catch (error) {
        if (isApiError(error, 404)) return null;
        throw error;
      }
    },
    enabled,
  });
}

export function useSubmitTuning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TuningSessionIn) => unwrap(api.POST("/api/tuning/sessions", { body })),
    onSuccess: (session) => {
      qc.setQueryData(["tuning", "latest"], session);
      qc.invalidateQueries({ queryKey: keys.soundProfile });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
      qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export type StorePage = Schemas["StorePage"];
export type StoreItem = Schemas["StoreItem"];
export type StoreProduct = Schemas["StoreProduct"];
export type StoreQuery = {
  q?: string;
  kind?: "in-ear" | "earbuds" | "headphones";
  brand?: string;
  min_inr?: number;
  max_inr?: number;
  with_photo?: boolean;
  sort?: "featured" | "match" | "price_asc" | "price_desc" | "name";
  offset?: number;
  limit?: number;
};

/** A page of the store. Public; personal scores appear when a sound profile exists. */
export function useStore(query: StoreQuery) {
  return useQuery({
    queryKey: ["store", query],
    queryFn: () => unwrap(api.GET("/api/store/products", { params: { query } })),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/** One product in full: its photographs, listings, measurements and fit. */
export function useStoreProduct(slug: string | null | undefined) {
  return useQuery({
    queryKey: ["store", "product", slug],
    queryFn: () => unwrap(api.GET("/api/store/products/{slug}", { params: { path: { slug: slug! } } })),
    enabled: Boolean(slug),
    staleTime: 60_000,
  });
}

export type ListenCurve = Schemas["ListenCurve"];

/**
 * How to re-shape music so it takes on an earphone's measured tuning (applied by
 * `lib/audio/through`). `against` is a measured earphone's slug or "target";
 * left out, the server uses what the listener said they wear, when it can.
 */
export const listenCurveQuery = (slug: string, against?: string) => ({
  queryKey: ["store", "listen", slug, against ?? "auto"] as const,
  queryFn: () =>
    unwrap(
      api.GET("/api/store/products/{slug}/listen", {
        params: { path: { slug }, query: against ? { against } : {} },
      }),
    ),
  staleTime: 5 * 60_000,
});

export type TuningSong = Schemas["SongOut"];

/** The listener's analysed songs, to choose their own for the listening session. */
export function useTuningSongs(enabled = true) {
  return useQuery({
    queryKey: ["tuning", "songs"],
    queryFn: () => unwrap(api.GET("/api/tuning/songs")),
    enabled,
    staleTime: 10 * 60_000,
  });
}
