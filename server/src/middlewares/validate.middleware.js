import { ApiError } from "../utils/ApiError.js";

export const validate = (schema, property = "body", options = {}) => (request, _response, next) => {
  const { value, error } = schema.validate(request[property], {
    abortEarly: false,
    stripUnknown: options.stripUnknown ?? true,
  });

  if (error) {
    return next(
      new ApiError(
        400,
        "Validation failed",
        error.details.map((item) => item.message),
      ),
    );
  }

  if (property === "query") {
    request.validatedQuery = value;
  } else {
    request[property] = value;
  }
  return next();
};
