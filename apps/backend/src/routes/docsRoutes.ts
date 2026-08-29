import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

const router = Router();
const openapiDocument = YAML.load(path.resolve(__dirname, '../config/openapi.yaml'));

router.use('/', swaggerUi.serve, swaggerUi.setup(openapiDocument));

export default router;
