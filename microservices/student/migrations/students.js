/**
 * @type {import("mongodb").Db}
 */
const studentsMicroserviceDb = db;

studentsMicroserviceDb.createCollection("students", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["name", "age", "genre", "schoolId"],
      properties: {
        name: {
          bsonType: "string",
          description: "The name of the student, required",
        },
        age: {
          bsonType: "int",
          description: "The name of the student, required",
        },
        genre: {
          bsonType: "string",
          enum: ["Male", "Female", "Other"],
          description:
            "The gender of the student (either Male, Female or Other), required",
        },
        schoolId: {
          bsonType: "int",
          description:
            "The ID of the student school in the school microservice, required",
        },
      },
    },
  },
});
