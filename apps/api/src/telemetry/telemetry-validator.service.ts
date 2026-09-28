import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate as validateDto, type ValidationError } from 'class-validator';
import { DeviceStatusMessageDto } from './dto/device-status-message.dto';
import { TelemetryMessageDto } from './dto/telemetry-message.dto';

interface ValidTelemetryMessage {
  valid: true;
  kind: 'telemetry';
  value: TelemetryMessageDto;
}

interface ValidStatusMessage {
  valid: true;
  kind: 'status';
  value: DeviceStatusMessageDto;
}

interface InvalidMessage {
  valid: false;
  reason: string;
}

export type MqttValidationResult =
  ValidTelemetryMessage | ValidStatusMessage | InvalidMessage;

@Injectable()
export class TelemetryValidatorService {
  async validateMessage(
    topic: string,
    payload: Buffer,
  ): Promise<MqttValidationResult> {
    const topicMatch =
      /^tunupa\/v1\/devices\/([^/]+)\/(telemetry|status)$/.exec(topic);

    if (!topicMatch) {
      return {
        valid: false,
        reason: `Tópico no reconocido: ${topic}`,
      };
    }

    const topicDeviceCode = topicMatch[1];
    const messageKind = topicMatch[2];

    if (!topicDeviceCode || !messageKind) {
      return {
        valid: false,
        reason: `Tópico incompleto: ${topic}`,
      };
    }

    const parsedPayload = this.parsePayload(payload);

    if (!parsedPayload.valid) {
      return parsedPayload;
    }

    if (messageKind === 'telemetry') {
      const dto = plainToInstance(TelemetryMessageDto, parsedPayload.value);

      const errors = await this.validateDto(dto);

      if (errors.length > 0) {
        return {
          valid: false,
          reason: this.formatErrors(errors),
        };
      }

      if (dto.deviceCode !== topicDeviceCode) {
        return {
          valid: false,
          reason:
            `El deviceCode "${dto.deviceCode}" no coincide ` +
            `con el tópico "${topicDeviceCode}".`,
        };
      }

      return {
        valid: true,
        kind: 'telemetry',
        value: dto,
      };
    }

    const dto = plainToInstance(DeviceStatusMessageDto, parsedPayload.value);

    const errors = await this.validateDto(dto);

    if (errors.length > 0) {
      return {
        valid: false,
        reason: this.formatErrors(errors),
      };
    }

    if (dto.deviceCode !== topicDeviceCode) {
      return {
        valid: false,
        reason:
          `El deviceCode "${dto.deviceCode}" no coincide ` +
          `con el tópico "${topicDeviceCode}".`,
      };
    }

    return {
      valid: true,
      kind: 'status',
      value: dto,
    };
  }

  private parsePayload(
    payload: Buffer,
  ): { valid: true; value: object } | InvalidMessage {
    try {
      const parsed: unknown = JSON.parse(payload.toString('utf8'));

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return {
          valid: false,
          reason: 'El payload debe ser un objeto JSON.',
        };
      }

      return {
        valid: true,
        value: parsed,
      };
    } catch {
      return {
        valid: false,
        reason: 'El payload no contiene JSON válido.',
      };
    }
  }

  private validateDto(value: object): Promise<ValidationError[]> {
    return validateDto(value, {
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: {
        target: false,
        value: false,
      },
    });
  }

  private formatErrors(errors: ValidationError[]): string {
    const messages = this.collectErrors(errors);

    return messages.length > 0
      ? messages.join('; ')
      : 'El mensaje MQTT no cumple el contrato requerido.';
  }

  private collectErrors(errors: ValidationError[], parent = ''): string[] {
    return errors.flatMap((error) => {
      const property = parent ? `${parent}.${error.property}` : error.property;

      const currentMessages = Object.values(error.constraints ?? {}).map(
        (message) => `${property}: ${message}`,
      );

      const childMessages = this.collectErrors(error.children ?? [], property);

      return [...currentMessages, ...childMessages];
    });
  }
}
