import { describe, expect, it } from "vitest";
import { assertCustomerIsNotInstructor } from "./bookingGuards";

describe("assertCustomerIsNotInstructor", () => {
  it("rejects a customer booking their own instructor service", () => {
    expect(() => assertCustomerIsNotInstructor("trainer-1", "trainer-1"))
      .toThrow("cannot_book_yourself");
  });

  it("allows a customer to book another instructor", () => {
    expect(() => assertCustomerIsNotInstructor("customer-1", "trainer-1")).not.toThrow();
  });

  it("does not treat a venue booking without an instructor as a self-booking", () => {
    expect(() => assertCustomerIsNotInstructor("customer-1")).not.toThrow();
  });
});

describe("group service booking guard", () => {
  it("routes group services through seat enrollment", async () => {
    const { assertIndividualService } = await import("./bookingGuards");
    expect(() => assertIndividualService({ kind: "group", courseId: "course-1" })).toThrow("use_course_enrollment");
    expect(() => assertIndividualService({ courseId: "course-1" })).toThrow("use_course_enrollment");
    expect(() => assertIndividualService({})).not.toThrow();
  });
});
