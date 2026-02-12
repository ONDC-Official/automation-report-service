import Joi from "joi";

export const ackResponseSchema = Joi.object({
  // Temporarily commented out context validation
  // context: Joi.object({
  //   domain: Joi.string().required(),
  //   country: Joi.string().required(),
  //   city: Joi.string().required(),
  //   action: Joi.string().required(),
  //   core_version: Joi.string().required(),
  //   bap_id: Joi.string().required(),
  //   bap_uri: Joi.string().uri().required(),
  //   transaction_id: Joi.string().required(),
  //   message_id: Joi.string().required(),
  //   timestamp: Joi.string().isoDate().required(),
  //   bpp_id: Joi.string(),
  //   bpp_uri: Joi.string().uri(),
  //   ttl: Joi.string(),
  // }).required(),

  message: Joi.object({
    ack: Joi.object({
      status: Joi.string().valid("ACK", "NACK").required(),
    }).required(),
  }).required(),

  error: Joi.when(Joi.ref("message.ack.status"), {
    is: "NACK",
    then: Joi.object({
      code: Joi.string().required(),
      message: Joi.string().required(),
    }).required(),
    otherwise: Joi.forbidden(),
  }),
});

export const ackOnlySchema = Joi.object({
  message: Joi.object({
    ack: Joi.object({
      status: Joi.string().required(),
    }).required(),
  }).optional(),
  error: Joi.when("message.ack.status", {
    is: "NACK",
    then: Joi.object({
      code: Joi.string().required(),
      message: Joi.string().required(),
    }).required(),
    otherwise: Joi.forbidden(),
  }),
});


