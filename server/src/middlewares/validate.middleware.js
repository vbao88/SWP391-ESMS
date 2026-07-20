import { ApiError } from "../utils/ApiError.js";

export const validate = (schema, property = "body") => (request, _response, next) => {
  const { value, error } = schema.validate(request[property], {
    abortEarly: false,
    stripUnknown: true,
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

  request[property] = value;
  return next();
};
